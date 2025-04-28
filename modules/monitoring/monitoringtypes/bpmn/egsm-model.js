var EventEmitter = require('events')
var xml2js = require('xml2js');
const { EgsmStage } = require('./egsm-stage');

/**
 * Class repsesenting an eGSM model
 * Note that this is just a partial represantation of an eGSM Engine, does not include deployment logic and functionalities
 * Class is intended to serve as local representation of an eGSM engine deployed on a Worker and be available for the translator anytime without network delays and overheads 
 */
class EgsmModel {
    constructor(modelXml) {
        this.model_xml = modelXml
        this.model_roots = []
        this.stages = new Map()
        //this.event_queue = []
        //this.changed_stages = []
        //this.rule_violations = []
        this._buildModel(modelXml)
        this.event_emitter = new EventEmitter()
    }

    /**
     * Update a specified stage in the model
     * @param {*} stageId ID to specify the Stage to update
     * @param {*} status New Status
     * @param {*} state New State
     * @param {*} compliance New Compliance
     */
    updateStage(stageId, status, state, compliance) {
        this.stages.get(stageId).update(status, state, compliance)
    }

    /**
     * Update a condition of a stage in the model
     * Will only be applied if the parent of the stage is a valid type (INCLUSIVE, EXCLUSIVE, ITERATION)
     * @param {*} stageId ID to specify the Stage to update
     * @param {*} value New condition value - boolean
     */
    recordStageCondition(stageId, value) {
        var stage = this.stages.get(stageId)
        var parentId = stage.parent
        if (!this.stages.has(parentId)) {
            return
        }
        var parent = this.stages.get(parentId)
        if (parent.type !== 'INCLUSIVE' && parent.type !== 'EXCLUSIVE' && parent.type !== 'ITERATION') {
            return
        }
        stage.recordCondition(value)
    }

    /**
     * Apply a snapshot to drive the model to a desired state
     * @param {Object} snapshot List of Objects representing the State of each Stages 
     */
    applySnapshot(snapshot) {
        //TODO
        //- reset all stages
        //- parse snapshot
        //- apply the states from the snapshot
    }

    /**
     * Parsing the stages recursively from the provided XML and builds a Process Tree
     * @param {String} stage ID of the currently parsed stage 
     * @param {String} parent ID of the Parent in the Process Tree of the currently parsed stage
     */
    _parseStageRecursive(stage, parent) {
        var children = stage['ca:SubStage'] || []
        this.stages.set(stage['$'].id, new EgsmStage(stage['$'].id, stage['$'].name, parent, undefined,
            (parent != 'NONE' && this.stages.get(parent).type == 'SEQUENCE' && this.stages.get(parent).type != 'LIFECYCLE') ?
                stage?.['ca:ProcessFlowGuard']?.[0]?.['$'].expression : undefined))
        for (var key in children) {
            this.stages.get(stage['$'].id).addChild(children[key]['$'].id)
            this._parseStageRecursive(children[key], stage['$'].id)
        }
    }

    /**
     * Instantiate Stages and build Process Tree based on the provided XML eGSM model definition in the constructor
     */
    _buildModel() {
        if(this.model_xml == undefined){
            return
        }
        var context = this
        xml2js.parseString(this.model_xml, function (err, result) {
            if (err) {
                throw new Error('Error while parsing XML: ' + err)
            }
            var roots = result['ca:CompositeApplicationType']['ca:Component'][0]['ca:GuardedStageModel'][0]['ca:Stage'];
            for (var root in roots) {
                context.model_roots.push(roots[root]['$'].id)
                context._parseStageRecursive(roots[root], 'NONE')
            }
        });
    }

    /**
     * Retrieves state-status information of each Stage of the model
     * @returns And array containing {stage_)name; status, state}
     */
    getStageInfoArray() {
        var result = []
        for (var [key, entry] of this.stages) {
            if (entry.type == 'ACTIVITY') {
            result.push({
                name: entry.id,
                status: entry.status,
                state: entry.state
            })
            }
        }
        return result
    }
}

module.exports = {
    EgsmModel
}