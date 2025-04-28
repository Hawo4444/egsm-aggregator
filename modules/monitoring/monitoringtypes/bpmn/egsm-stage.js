/**
 * Class representing an eGSM Stage
 */
class EgsmStage {
    /**
     * @param {String} id Unique ID  
     * @param {String} name Optinal name (use '' if not used)
     * @param {String} parent ID of the parent stage in the Process Tree
     * @param {String} type Type of the Stage (SEQUENCE/PARALLEL etc) In case of undefined it will be determined based on the ID and parent
     * @param {String} processFlowGuard String expression of Process FLow Guards attached to the Stage (used to determine direct predecessor)
     */
    constructor(id, name, parent, type, processFlowGuard) {
        this.id = id
        this.name = name
        this.parent = parent
        if (!type) {
            this.type = this.determineStageType()
        }
        else {
            this.type = type
        }
        this.direct_predecessor = this.getSequentialPredecessor(processFlowGuard) //If the parent activity has SEQUENCE type it will contain the id of predecessor activity in case of correct execution (NONE if no predecessor). If the parent is not SEQUENCE then it will contain NA. Also NA for exception blocks
        this.status = "REGULAR" //REGULAR-FAULTY 
        this.state = "UNOPENED" //UNOPENED-OPEN-CLOSED
        this.compliance = "ONTIME" //ONTIME-SKIPPED-OUTOFORDER
        this.children = []
        this.propagated_conditions = new Set() //SHOULD_BE_CLOSED
        this.history = []
        this.condition_history = []
        this.recordHistory()
    }

    /**
     * Records the current state of the Stage in the history
     */
    recordHistory() {
        const now = new Date()
        const timestamp = performance.now()
        const change = {
            timestamp: timestamp, //for sorting/comparison purposes
            //TODO: this should be from the engine, but need to figure out what to use when parsing the XML (also when resetting)
            timestampStr: now.toISOString(), //human-readable format
            status: this.status,
            state: this.state,
            compliance: this.compliance,
        }
        this.history.push(change)
    }

    /** 
     * Returns the history of the Stage
    */
    getHistory() {
        return this.history
    }

    /**
     * Returns the latest opening change of the Stage
    */
    getLatestOpening() {
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.history[i].state === 'OPEN') { 
                return this.history[i]
            }
        }
        return null
    }

    /**
     * Returns the latest change before a timestamp
     * @param {Number} before Timestamp to check against
    */
    getLatestChange(before) {
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.history[i].timestamp < before) {
                return this.history[i]
            }
        }
        return null
    }

    /**
     * Returns the next closing time of the Stage after a timestamp
     * @param {Number} after Timestamp to check against
    */
    getClosingTimeAfter(after) {
        for (let i = 0; i < this.history.length; i++) {
            if (this.history[i].state === 'CLOSED' && this.history[i].timestamp > after) {
                return this.history[i]
            }
        }
        return null
    }

    /**
     * Returns the next opening time of the Stage between timestamps
     * @param {Number} from Timestamp to check from
     * @param {Number} to Timestamp to check to (optional)
    */
    getOpeningTimeBetween(from, to) {
        for (let i = 0; i < this.history.length; i++) {
            if (this.history[i].state === 'OPEN' && this.history[i].timestamp > from && 
                    (to == null || this.history[i].timestamp < to)) {
                return this.history[i]
            }
        }
        return null
    }

    /**
    * Returns an array of {open, close} pairs from the stage's history
    * @returns {Array<{index: Number, open: Number, close: Number}>}
    */
    getOpenClosePairs() {
        const pairs = []
        let currentOpen = null
        let pairIndex = 0
        for (const event of this.history) {
            if (event.state === 'OPEN') {
                currentOpen = event
            } else if (event.state === 'CLOSED' && currentOpen) {
                pairs.push({
                    index: pairIndex,
                    open: currentOpen.timestamp,
                    close: event.timestamp
                })
                pairIndex++
                currentOpen = null
            }
        }
        if (currentOpen) {
            pairs.push({
                index: pairIndex,
                open: currentOpen.timestamp,
                close: null
            })
        }
        return pairs
    }

    recordCondition(value) {
        const timestamp = performance.now()
        this.condition_history.push({
            timestamp: timestamp,
            value: value
        })
    }

    getConditionAt(timestamp) {
        let latest = null
        for (const entry of this.condition_history) {
            if (entry.timestamp <= timestamp) {
                latest = entry
            } else {
                break
            }
        }
        return latest ? latest.value : null
    }

    getLatestCondition() {
        if (this.condition_history.length > 0) {
            return this.condition_history[this.condition_history.length - 1].value
        }
        return null
    }

    /**
     * Updates the state of the Stage. Any argument can be undefined too, in this case the old value will be preserved
     * @param {String} status New Status
     * @param {String} state New State
     * @param {String} compliance New Compliance
     */
    update(status, state, compliance) {
        if (status) {
            this.status = status
        }
        if (state) {
            this.state = state
        }
        if (compliance) {
            this.compliance = compliance
        }
        this.recordHistory()
    }

    /**
     * Add a new child Stage to the Stage
     * @param {String} child ID of the new child Stage 
     */
    addChild(child) {
        this.children.push(child)
    }

    /**
     * Adds a new Propagated Condition to the state, which will be easily accessible by children during tree traversal
     * @param {String} condition 
     */
    propagateCondition(condition) {
        this.propagated_conditions.add(condition)
    }

    /**
     * Removes all Propagated Conditions
     */
    cleanPropagations() {
        this.propagated_conditions = new Set()
    }

    /**
     * Resets the Stage to its original state
     */
    reset() {
        this.cleanPropagations()
        this.status = "REGULAR"
        this.state = "UNOPENED"
        this.compliance = "ONTIME"
        this.recordHistory()
    }

    /**
     * Determines the type of the Stage based on its ID
     * @returns Type of the Stage
     */
    determineStageType() {
        if (this.id.includes('iteration')) {
            return 'ITERATION'
        }
        else if (this.id.includes('SequenceFlow') || this.id.includes('_flow')  || this.parent == 'NONE') {
            return 'SEQUENCE'
        }
        else if (this.id.includes('Parallel')) {
            return 'PARALLEL'
        }
        else if(this.id.includes('_LC')){
            return 'LIFECYCLE'
        }
        else if (this.id.includes('ExclusiveGateway')) {
            return 'EXCLUSIVE'
        }
        else if(this.id.includes('InclusiveGateway')) {
            return 'INCLUSIVE'
        }
        else if(this.id.includes('_exception')) {
            return 'EXCEPTION'
        }
        else {
            return 'ACTIVITY'
        }
    }

    /**
     * Determines the direct predecessor of the Stage based on its Process Flow Guard
     * @param {String} processFlowGuard Process flow guard expression
     * @returns 
     */
    getSequentialPredecessor(processFlowGuard){
        if(processFlowGuard && this.type != 'EXCEPTION') {
            var elements = processFlowGuard.split(' and ')
            for(var key in elements){
                if(!elements[key].includes('not')){
                    return elements[key].replace('GSM.isMilestoneAchieved(','').replace(' ','').replace('_m1)','').replace('(','').replace(')',"")
                }
            }
            return 'NONE'
        }
        return 'NA'
    }
}

module.exports = {
    EgsmStage
}