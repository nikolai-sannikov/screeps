const { EnergyMiningManager } = require("./mining")
const { Base, BaseManager } = require("./base")
const { garbageCollector } = require("./garbageCollector")

function initializeMemory(){
    if (!Memory.orders)
        Memory.orders = []
}

module.exports.loop = function () {
    initializeMemory()

    const mainSpawn = Game.spawns["Spawn1"]
    const base = new Base(mainSpawn.id)

    if (base.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
        EnergyMiningManager.assignDeliveryTargetId(base.getPrimaryStorage().id)
    else
        EnergyMiningManager.assignDeliveryTargetId(base.room.controller.id)
    EnergyMiningManager.run(base.room)
    BaseManager.run()

    garbageCollector()

}