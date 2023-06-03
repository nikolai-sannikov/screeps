const {SpawnCreepOrder} = require("./orders.spawnCreep");

class BaseOrdersManager{
    constructor(base) {
        this.base = base
        if (!Memory.orders[this.base.id])
            Memory.orders[this.base.id] = []
    }

    pushOrder(order){
        if (order instanceof SpawnCreepOrder)
            Memory.orders[this.base.id].push(order)
    }

    getOrdersByOwner(ownerId){
        return Memory.orders[this.base.id].filter(o => o.ownerId === ownerId)
    }

    getNextSpawnOrder(){
        return Memory.orders[this.base.id][0]
    }

    removeOrder(order){
        Memory.orders[this.base.id] = Memory.orders[this.base.id].filter(o => order.id !== o.id)
    }
}


class BaseManager{
    static getBase(spawnId){
        return new Base(spawnId)
    }

    static getAllBases(){
        return _.map(Game.spawns, spawn => new Base(spawn.id))
    }
    static run(){
        this.getAllBases().map(base => base.run())
    }
}


class Base {
    // TODO: base upgrade orders
    // TODO: programmatic base construction

    constructor(spawnId){
        this.spawn = Game.getObjectById(spawnId)
        this.room = this.spawn.room
        this.id = `base_${this.spawn.id}`
        this.store = this.getPrimaryStorage().store
        this.pos = this.spawn.pos
        this.ordersManager = new BaseOrdersManager(this)
    }

    getPrimaryStorage(){
        let specializedStorage = this.spawn.pos.findInRange([StructureStorage, StructureContainer], 1)
        if (specializedStorage.length){ return specializedStorage }

        return this.spawn
    }
    getMaxDesignCost(){
        return this.room.energyCapacity
    }

    submitOrder(order){
        this.ordersManager.pushOrder(order)
    }

    run(){
        const spawnOrder = this.ordersManager.getNextSpawnOrder()
        if (spawnOrder && !this.spawn.spawning) {
            const res = this.spawn.spawnCreep(
                spawnOrder.creep.composition, spawnOrder.creep.name, {memory: spawnOrder.creep.memory}
            )
            if ([OK, ERR_NAME_EXISTS].includes(res)) {
                this.ordersManager.removeOrder(spawnOrder)
            }
        }

    }
}

module.exports = { BaseManager,  Base }