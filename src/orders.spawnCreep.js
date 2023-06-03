class SpawnCreepOrder{
    creep = {}

    constructor(composition, memory, ownerId) {
        this.creep.composition = composition
        this.creep.memory = memory
        this.creep.name = `creep_${ownerId}_${Game.time}`
        this.ownerId = ownerId
        this.submitTime = Game.time
        this.id = `${ownerId}_${this.submitTime}`
    }
}

module.exports = { SpawnCreepOrder }