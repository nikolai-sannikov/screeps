class AbstractCreep{
    constructor(creep){
        this.instance = Game.creeps[creep.name]
        this.pos = creep.pos
        this.memory = creep.memory
        this.name = creep.name
        this.store = creep.store
    }

    renewCreep(){        
        const spawn = this.pos.findClosestByPath(FIND_MY_SPAWN)
        this.moveTo(spawn, {ignoreCreeps: true})
    }
    
    run(){        
        this[this.memory.task]()
    }
}

module.exports = { AbstractCreep }