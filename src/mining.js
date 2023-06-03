const { AbstractCreep } = require("./abstract.creep")
const { SpawnCreepOrder } = require("./orders.spawnCreep")
const {BaseManager} = require("./base");


class EnergyMiningManager{
    static getSite(id){
        if (!Memory.miningSites)
            return undefined
        const found = _.find(Memory.miningSites, m => m.miningTargetId === id || m.id === id)
        if (found)
            return new MiningSite(found.id)
        else
            return undefined
    }
    static getAllSites(){
        return _.map(Memory.miningSites, sd => new MiningSite(sd.id))
    }
    static createNewSites(room){
        const roomEnergySources = room.find(FIND_SOURCES, {filter: source => !this.getSite(source.id)})
        for (const source of roomEnergySources){
            MiningSite.create(source.id)
        }
    }
    static assignDeliveryTargetId(id){        
        this.getAllSites().map(s => s.setDeliveryTargetId(id))
    }
    static run(room){        
        this.createNewSites(room)
        
        for (var site of this.getAllSites()){
            site.run()
            site.visualize()
        }
    }
}


const ENERGY_SOURCE_REGENERATION_TIME = 300


function getFreeAdjacentCells(pos){
    const room = Game.rooms[pos.roomName]
    const adjacent_cells = []
    for (var i of [-1, 0, 1])
        for (var j of [-1, 0, 1])
            if (!(i===0 && j===0))                
                adjacent_cells.push(new RoomPosition(pos.x+i, pos.y+j, pos.roomName))    
    return adjacent_cells.filter((pos) => room.getTerrain().get(pos.x, pos.y) !== 1)
}


function computePathDuration(path, composition, carriedCapacity = 0){
    const pathTerrain = path.path.map(pos => pos.look().find(obj => obj.type === "terrain").terrain)
    const numMoveParts = composition.filter(part => part === MOVE).length
    let numSlowParts = composition.filter(part => ![MOVE, CARRY].includes(part)).length;
    numSlowParts += Math.ceil(carriedCapacity / 50)    
    const stepDurations = pathTerrain.map(terrain =>{
        let fatigue = 1;
        let ticksToExit = 1;
        switch(terrain){
            case "plain":
                fatigue = 2 * numSlowParts
                break
            case "swamp":
                fatigue = 10 * numSlowParts
        }
        ticksToExit += Math.ceil(fatigue / (numMoveParts * 2))
        return ticksToExit
    })
    return stepDurations.reduce((a, b) => a + b, 0)
}

class MiningCreep extends AbstractCreep{
    getMiningSpot(){
        const rawSpot = this.memory.miningSpot
        if (!rawSpot)
            return null
        return new RoomPosition(rawSpot.x, rawSpot.y, rawSpot.roomName)
    }

    mine(){
        const isInPosition = this.instance.pos.isEqualTo(this.getMiningSpot())        
        
        if (isInPosition){
            const miningTarget = Game.getObjectById(this.memory.miningTarget.id)
            this.instance.harvest(miningTarget)
        }
        else{
            this.instance.moveTo(this.getMiningSpot())
        }
    }

    dump(){        
        const dumpTarget = Game.getObjectById(this.memory.dumpTargetId)
        let res
        if (dumpTarget instanceof ConstructionSite){
            res = this.instance.build(dumpTarget)
        }
        else {
            if (dumpTarget instanceof StructureController)
                res = this.instance.upgradeController(dumpTarget)
            else {
                res = this.instance.transfer(dumpTarget, RESOURCE_ENERGY)
            }
        }
        if(res === ERR_NOT_IN_RANGE)
            this.instance.moveTo(dumpTarget)
    }

    position(){
        const path = EnergyMiningManager.getSite(this.memory.owner).getPathFromSpawn()
        const res = this.instance.moveByPath(path.path)
        if (res === ERR_NOT_FOUND){
            this.memory.task = "mine"
        }
    }

    run(){        
        if (!this.memory.task)
            this.memory.task = "position"        

        if (this.memory.task === "mine"){
            if (this.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
                this.memory.task = "dump"
        }        
        if (this.memory.task === "dump"){
            if (this.store[RESOURCE_ENERGY] === 0)
                this.memory.task = "mine"
        }
        super.run()
    }
}


class MiningSite{
    static create(miningTargetId) {
        const miningTarget = Game.getObjectById(miningTargetId)
        const siteData = {
            id: `ms_${miningTargetId}`,
            miningTargetId: miningTargetId,
            dumpStorageId: null,
            deliveryTargetId: null,
            assignedSpawnId: miningTarget.pos.findClosestByRange(FIND_MY_SPAWNS).id,
            pathFromSpawn: null
        }
        if (!Memory.miningSites)
            Memory.miningSites = {}
        Memory.miningSites[siteData.id] = siteData
        console.log("Created mining site", siteData.id)
    }
    
    constructor(id){
        const siteData = Memory.miningSites[id]
        this.id = siteData.id
        this.memory = siteData
        this.miningTarget = Game.getObjectById(this.memory.miningTargetId)
        this.dumpTarget = Game.getObjectById(this.memory.dumpStorageId)
        this.deliveryTarget = Game.getObjectById(this.memory.deliveryTargetId)
        this.assignedBase = BaseManager.getBase(this.memory.assignedSpawnId)
        if (!this.deliveryTarget){            
            console.log("Mining site", this.id, "missing delivery target. Target id:", this.memory.deliveryTargetId)
        }
        if (!this.memory.pathFromSpawn)
            this.recomputePathFromSpawn()
    }    

    setDeliveryTargetId(id){
        Memory.miningSites[this.id].deliveryTargetId = id
    }

    visualize(){
        new RoomVisual().text(this.id, this.miningTarget.pos)        
        this.getMiningSpots().map(miningSpot => new RoomVisual().circle(miningSpot))        
        //if (this.getDumpTarget())
        //   new RoomVisual().text(`dump_${this.id}`, this.dumpTarget.pos)
        if (this.getPathFromSpawn()){
            new RoomVisual(null).poly(this.getPathFromSpawn().path)
            /*
            const composition = MiningCreepDesigner.minerComposition(this.assignedBase.room.energyCapacity, this.getCreepRequirements())
            const duration = computePathDuration(this.getPathFromSpawn(), composition)
            console.log("Path duration", duration)
             */
        }
    }

    run(){        
        const order = this.makeCreepSpawnOrder()
        if (order) {
            console.log("Mining group wants to place an order", order)
            this.assignedBase.submitOrder(order)
        }
        const creeps = this.getMiners()
        this.assignMiningSpots()

        for (var creep of creeps){
            creep.memory.dumpTargetId = this.getDumpTarget().id
            const creepClass = new MiningCreep(creep)
            creepClass.run()
        }
    }

    makeCreepSpawnOrder(){
        // TODO: preorder creep if an existing is close to death
        const numPendingOrders = this.assignedBase.ordersManager.getOrdersByOwner(this.id).length
        if (this.getMiningSpots().length <= this.getMiners().length + numPendingOrders){
            return
        }                    
        const composition = MiningCreepDesigner.minerComposition(this.assignedBase.getMaxDesignCost(),
            this.getCreepRequirements())
        return new SpawnCreepOrder(composition, { owner: this.id, role: "miner" }, this.id)
    }

    getPathFromSpawn(){
        const rawPath = this.memory.pathFromSpawn
        rawPath.path = rawPath.path.map(rawPos => new RoomPosition(rawPos.x, rawPos.y, rawPos.roomName))
        return rawPath
    }

    assignMiningSpots(){
        const unassignedMiners = this.getMiners().filter(c => !c.memory.miningSpot)
        const assignedSpots = this.getMiners().map(c => c.getMiningSpot()).filter(s => s != null)
        let unassignedSpots = this.getMiningSpots().filter(spot => !assignedSpots.find(s => s.isEqualTo(spot)));
        unassignedSpots = unassignedSpots.sort((s1, s2) => s2.getRangeTo(this.getDumpTarget().pos) - s1.getRangeTo(this.getDumpTarget().pos))        

        unassignedMiners.map(miner => {
            miner.memory.miningSpot = unassignedSpots.pop()
            miner.memory.miningTarget = this.miningTarget
        })
    }

    recomputePathFromSpawn(){
        // TODO: avoid mining spots (maybe need to extend target range to 2)
        let site = this.dumpTarget;
        if (!site)
            site = this.miningTarget
        this.memory.pathFromSpawn = PathFinder.search(this.assignedBase.pos, site.pos)
    }

    getMiners(){
        return _.filter(Game.creeps, (creep) => creep.memory.owner === this.id && creep.memory.role === "miner").map(creep => new MiningCreep(creep))
    }

    getDumpTarget(){
        if (this.memory.dumpStorageId)
            return Game.getObjectById(this.memory.dumpStorageId)
        if (this.memory.deliveryTargetId)
            return Game.getObjectById(this.memory.deliveryTargetId)
    }

    getMiningSpots(){
        return getFreeAdjacentCells(this.miningTarget.pos)
    }

    getCreepRequirements(){
        const totalDesiredMiningSpeed = this.miningTarget.energyCapacity / ENERGY_SOURCE_REGENERATION_TIME
        return {
            maxMiningSpeed: totalDesiredMiningSpeed / this.getMiningSpots().length
        }
    }
}

class MiningCreepDesigner{
    /*
    WORK
    Harvests 2 energy units from a source per tick.
    Harvests 1 resource unit from a mineral or a deposit per tick.
    Builds a structure for 5 energy units per tick.
    Repairs a structure for 100 hits per tick consuming 1 energy unit per tick.
    Dismantles a structure for 50 hits per tick returning 0.25 energy unit per tick.
    Upgrades a controller for 1 energy unit per tick.
    */
    static ENERGY_MINED_PER_WORK = 2;
    

    static estimateBuildCost(composition){
        let cost = 0;
        composition.map(part => cost += BODYPART_COST[part])
        return cost
    }

    static estimateMiningSpeed(composition){
        return composition.filter(part => part === WORK).length * this.ENERGY_MINED_PER_WORK
    }

    static minerComposition(maxCost){
        let fixedComposition = [MOVE, CARRY, WORK];
        const addon = [];
        while (this.estimateBuildCost(fixedComposition.concat(addon)) < maxCost){            
            fixedComposition = fixedComposition.concat(addon)
            addon.push(WORK)
            addon.push(MOVE)
        }
        return fixedComposition
    }    
}

module.exports = { EnergyMiningManager }