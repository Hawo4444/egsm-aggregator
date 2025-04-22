const { BpmnModel } = require("./bpmn-model")
const { EgsmModel } = require("./egsm-model")

/**
 * Deviation superclass to represent one instance of Deviation detected in the eGSM model
 */
class Deviation {
    constructor(type, blockA, blockB, index) {
        this.type = type
        this.block_a = blockA
        this.block_b = blockB
        this.index = index
    }
}

/**
 * SkipDeviation is a type of deviation when in a sequence of stages one or more stage has been skipped, potentially causing the upcoming stage to be OutOfOrder
 */
class SkipDeviation extends Deviation {
    /**
     * @param {String[]} skipped The skipped stage(s) 
     * @param {String} outOfOrder The upcoming stage after the skipped sequence (OutOfOrder Stage)
     * @param {Number} index The parent stage's open-close pair index this deviation belongs to
     */
    constructor(skipped, outOfOrder, index) {
        super('SKIPPED', skipped, outOfOrder, index)
    }
}

/**
 * OverlapDeviation is a type of deviation when a stage overlaps with another block of stages, potentially causing the upcoming stage to be OutOfOrder
 */
class OverlapDeviation extends Deviation {
    /**
     * @param {String[]} overlapped The skipped stage(s) 
     * @param {String} open The upcoming stage after the skipped sequence (OutOfOrder Stage)
     * @param {Number} index The parent stage's open-close pair index this deviation belongs to
     */
    constructor(overlapped, open, index) {
        super('OVERLAP', overlapped, open, index)
    }
}

/**
 * IncorrectExecutionSequenceDeviation is a type of Deviation when a group of tasks has not been executed on the desired sequence
 */
class IncorrectExecutionSequenceDeviation extends Deviation {
    /**
     * @param {String} skipped ID-s of the affected Block
     * @param {String} origin ID-s of the stage before the originally skipped block got executed
     * @param {Number} index The parent stage's open-close pair index this deviation belongs to
     */
    constructor(skipped, origin, index) {
        super('INCORRECT_EXECUTION', skipped, origin, index)
    }
}

/**
 * IncompleteDeviation is a type of Deviation when a Stage has been opened, but not closed, suggesting that the its execution is not complete
 */
class IncompleteDeviation extends Deviation {
    /**
     * @param {String} block ID of the problematic Stage
     * @param {Number} index The parent stage's open-close pair index this deviation belongs to
     */
    constructor(block, index) {
        super('INCOMPLETE', block, null, index)
    }
}

/**
 * MultiExecutionDeviation is a type of Deviation when one stage has been executed multiple times (while it was intended once only)
 */
class MultiExecutionDeviation extends Deviation {
    /**
     * @param {String} block ID of the problematic Stage 
     * @param {Number} executionCount Number of times the stage was executed
     * @param {Number} index The parent stage's open-close pair index this deviation belongs to
     */
    constructor(block, executionCount, index) {
        super('MULTI_EXECUTION', block, null, index)
        this.executionCount = executionCount
    }
}

/**
 * IncorrectBranchDeviation is a type of Deviation happens when in an Exclusive or Inclusive block the wrong Branch has been selected
 */
class IncorrectBranchDeviation extends Deviation {
    /**
     * @param {String} executed ID of the actually executed Sequence
     * @param {Number} index The parent stage's open-close pair index this deviation belongs to
     */
    constructor(executed, index) {
        super('INCORRECT_BRANCH', executed, null, index)
    }
}

/**
 * Class representing one perspective of a Process encapsulating the corresponding eGSM and BPMN models
 */
class ProcessPerspective {
    /**
     * @param {String} perspectiveName Name of the perspective
     * @param {String} egsmXml XML description of the eGSM model
     * @param {String} bpmnXml XML description of the BPMN Model
     */
    constructor(perspectiveName, egsmXml, bpmnXml) {
        this.perspective_name = perspectiveName
        this.egsm_model = new EgsmModel(egsmXml)
        this.bpmn_model = new BpmnModel(perspectiveName, bpmnXml)
    }

    /**
     * Performs a full analysis on the eGSM model and detect deviations
     * The function will also reset the BPMN model (to remove old deviations), synchronize its states with the current eGSM ones
     * and apply the discovered deviations on it, so we can be sure that after the termination of this function the BPMN will be synchronized with the eGSM model 
     * @returns Returns by the discovered deviations as a list of Deviation instances
     */
    analyze() {
        //Process tree traversal to find deviations
        var deviations = []
        for (var key in this.egsm_model.model_roots) {
            deviations.concat(this._analyzeStage(this.egsm_model.model_roots[key], deviations))
            deviations = this._analyzeRecursive(this.egsm_model.model_roots[key], deviations)
        }
        //Update Status and State of BPMN Activities
        this.bpmn_model.resetModel()
        this.bpmn_model.applyEgsmStageArray(this.egsm_model.getStageInfoArray())
        //Apply deviations on the BPMN model
        deviations.forEach(element => {
            this.bpmn_model.applyDeviation(element)
        });
        return deviations
    }

    /**
     * Recursive function to discover deviations
     * Should be called only internally
     * @param {String} stage ID of the current stage
     * @param {Deviation[]} discoveredDeviations Array containing the already discovered Deviations
     * @returns An array of Deviation instances, containing the content of 'discoveredDeviations' argument and the freshly discovered Deviations
     */
    _analyzeRecursive(stage, discoveredDeviations) {
        var children = this.egsm_model.stages.get(stage).children
        var deviations = discoveredDeviations
        for (var child in children) {
            deviations = this._analyzeStage(children[child], deviations)
            this._analyzeRecursive(children[child], deviations)
        }

        return deviations
    }

    /**
     * Analyses a Single Stage regarding Deviations
     * Should be called internally only
     * @param {String} stage ID of the current Stage 
     * @param {Deviation[]} discoveredDeviations Array containing the already discovered Deviations
     * @returns An array of Deviation instances, containing the content of 'discoveredDeviations' argument and the freshly discovered Deviations
     */
    _analyzeStage(stage, discoveredDeviations) {
        console.log('analyze stage:' + stage)
        var deviations = discoveredDeviations

        //If the Stage is unopened and has been added to a SkipDeviation as 'skipped activity' then it means
        //that no substage has been opened neither, so the evaluation of children is not necessary
        for (var key in deviations) {
            if (deviations[key].constructor.name == 'SkipDeviation') {
                if (deviations[key].block_a.includes(stage)) {
                    return deviations
                }
            }
        }
        //If the Stage is UNOPENED, but not included in any SkipDeviation instance means that the stage
        //has not been executed, but it is intended (e.g.: Another branch has been executed and this was done correctly)
        //In this case there is no need to evaluate the children, since all of them will be in default state too
        var currentStage = this.egsm_model.stages.get(stage)
        if (currentStage.state == 'UNOPENED') {
            return deviations
        }

        var open = new Set()
        var unopened = new Set()
        var skipped = new Set()
        var outOfOrder = new Set()
        var children = this.egsm_model.stages.get(stage).children
        for (var key in children) {
            if (this.egsm_model.stages.get(children[key]).state == 'OPEN') {
                open.add(children[key])
            }
            else if (this.egsm_model.stages.get(children[key]).state == 'UNOPENED') {
                unopened.add(children[key])
            }
            if (this.egsm_model.stages.get(children[key]).compliance == 'SKIPPED') {
                skipped.add(children[key])
            }
            else if (this.egsm_model.stages.get(children[key]).compliance == 'OUTOFORDER') {
                outOfOrder.add(children[key])
            }
        }

        //The children have to be evaluated
        //Evaluation procedure depends on the type of the parent Stage
        for (const pair of currentStage.getOpenClosePairs()) {
            console.log('pair:' + pair)
        }

        switch (currentStage.type) {
            case 'SEQUENCE':
                //-OVERLAP and INCOMPLETE deviations-
                let processFlow = []
                for (var key in children) {
                    this.egsm_model.stages.get(children[key]).getHistory().forEach(change => {
                        processFlow.push({
                            timestamp: change.timestamp,
                            id: children[key],
                            status: change.status,
                            state: change.state,
                            compliance: change.compliance
                        });
                    });
                }
        
                processFlow.sort((a, b) => {
                    if (a.timestamp === null) return 1;
                    if (b.timestamp === null) return -1;
                    return a.timestamp - b.timestamp;
                });

                for (let i = 0; i < processFlow.length; i++) {
                    let item = processFlow[i];
                    if (item.state === "OPEN") {
                        let overlapped = []
                        let foundClosing = false
                        for (let j = i + 1; j < processFlow.length; j++) {
                            let nextItem = processFlow[j]
                            let history = this.egsm_model.stages.get(nextItem.id).getHistory();
                            if (nextItem.state === "OPEN" ||
                                (nextItem.state === "CLOSED" && !history.some(e => e.state === 'OPEN'))) {
                                overlapped.push(nextItem.id);
                            } else if (nextItem.state === "CLOSED" && item.id === nextItem.id) {
                                foundClosing = true
                                break
                            }
                        }
                        if (overlapped.length > 0) {
                            //If the overlap is caused by non-basic stage, we could propagate some condition to find the specific cause
                            deviations.push(new OverlapDeviation(overlapped, item.id))
                            this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED')
                            if (!foundClosing) {
                                deviations.push(new IncompleteDeviation(item.id))
                            }
                        }else if (!foundClosing) {
                            if ((item.parent && item.parent.propagated_conditions.has('SHOULD_BE_CLOSED'))) {
                                deviations.push(new IncompleteDeviation(item.id))
                                this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED')
                            }
                        }
                    }
                }

                //-MULTIEXECUTION deviation-
                this.egsm_model.stages.forEach((stage, key) => {
                    if (stage.compliance === 'OUTOFORDER') {
                        var count = 0;
                        if (stage.state === 'CLOSED' && !stage.getHistory().some(e => e.state === 'OPEN')) {
                            count = processFlow.filter(item => item.id === key && item.state === "CLOSED").length;
                        } else {
                            count = processFlow.filter(item => item.id === key && item.state === "OPEN").length;
                        }
                        if (count > 1) {
                            deviations.push(new MultiExecutionDeviation(key, count))
                        }
                    }
                });

                //-INCORRECTEXECUTIONSEQUENCE and SKIP deviation-
                var skippings = new Map() //OoO stage -> skipped sequence (skipped stages later extended by Unopened Stages before the Skipped one)
                this.egsm_model.stages.forEach((_, key) => {
                    var skippedFound = false
                    var openOutOfOrderFound = false
                    var previousStage = null
                    var firstFound = false
                    for (let i = 0; i < processFlow.length; i++) {
                        if (processFlow[i].id === key) {
                            if (!firstFound) {
                                firstFound = true
                                continue;
                            }
                            if (!skippedFound) {
                                if (processFlow[i].compliance !== 'SKIPPED') {
                                    break
                                } else {
                                    skippedFound = true
                                }
                            } else {
                                if (processFlow[i].compliance === 'OUTOFORDER') {
                                    openOutOfOrderFound = true
                                    for (let j = i - 1; j >= 0; j--) {
                                        if (processFlow[j].state === 'OPEN' || 
                                                (processFlow[j].state === 'CLOSED' && !this.egsm_model.stages.get(processFlow[j].id).history.some(e => e.state === 'OPEN'))) {
                                            previousStage = processFlow[j].id
                                            break
                                        }
                                    }
                                    break
                                }
                            }
                        }
                    }
                    if (skippedFound) {
                        if (openOutOfOrderFound) {
                            deviations.push(new IncorrectExecutionSequenceDeviation(key, previousStage))
                        } else {      
                            //If there is any SKIPPED stage among children it suggests, that at least one child activity has been skipped
                            //furthermore, at least one OoO child stage must exist                     
                            outOfOrder.forEach(outOfOrderElement => {
                                if (this.egsm_model.stages.get(outOfOrderElement).direct_predecessor == key) {
                                    skippings.set(outOfOrderElement, [key])
                                    //skipped.delete(skippedElement)
                                    unopened.delete(key)
                                    this.egsm_model.stages.get(key).propagateCondition('SHOULD_BE_CLOSED')
                                }
                            });
                            //Extending skipped sequences by trying to include UNOPENED stages
                            var finalized = false
                            while (!finalized) {
                                finalized = true
                                unopened.forEach(unopenedElement => {
                                    for (var [_, entry] of skippings.entries()) {
                                        if (this.egsm_model.stages.get(entry[0]).direct_predecessor == unopenedElement) {
                                            entry.unshift(unopenedElement)
                                            finalized = false
                                            unopened.delete(unopenedElement)
                                        }
                                    }
                                });
                            }
                        }
                    }
                });      
                

                //If the Sequence stage is supposed to be closed, then every UNOPENED stage was skipped
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    unopened.forEach(unopenedElement => {
                        skippings.set(null, [unopenedElement])
                        this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }

                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    var lastElement = [...unopened].find(candidate => {
                        return ![...unopened].some(other =>
                            this.egsm_model.stages.get(other).direct_predecessor === candidate
                        );
                    });
                
                    if (lastElement) {
                        var sequence = [];
                        var current = lastElement;
                        while (current) {
                            sequence.push(current);
                            this.egsm_model.stages.get(current).propagateCondition('SHOULD_BE_CLOSED');
                            unopened.delete(current);
                
                            var predecessorId = this.egsm_model.stages.get(current).direct_predecessor;
                            if (unopened.has(predecessorId)) {
                                current = predecessorId;
                            } else {
                                current = null;
                            }
                        }
                        skippings.set(null, sequence);
                    }
                }
                 
                //Creating SkipDeviation instances
                for (var [key, entry] of skippings) {
                    deviations.push(new SkipDeviation(entry, key))
                }

                //If the number of OoO stages is more than the number of skipped stages, then multi-execution of activity,
                //incomplete activity execution, overlapped execution, or wrong sequence of execution occurred. 
                //If there was no skip, then we can know that only one OoO means duplication and 
                //more than one means incorrect sequence, but skippings makes it impossible to distinguish
                /*if (outOfOrder.size > skipped.size) {
                    var members = []
                    outOfOrder.forEach(outOfOrderElement => {
                        if (!skippings.has(outOfOrderElement)) {
                            members.push(outOfOrderElement)
                        }
                    });
                    deviations.push(new IncorrectExecutionSequenceDeviation(members))
                }*/
                //Finally if any stage is open we can create an 'Incomplete Execution' deviation for each
                //if the parent stage should be already closed and in addition we propagate the condition to the
                //open children as well
                /*if (open.size > 0 && currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }*/
                break;
            case 'PARALLEL':
                //If the parent stage is should be closed then it means that at least one of the children processes
                //has not been executed completely or at all, so we can create IncompleteExecution and SkipDeviation instances 
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    unopened.forEach(unopenedElement => {
                        deviations.push(new SkipDeviation([unopenedElement], 'NA'))
                        this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }
                children.forEach(childId => {
                    var child = this.egsm_model.stages.get(childId)
                    var count = 0
                    if (child.compliance === 'OUTOFORDER') {
                        if (child.getHistory().some(e => e.state === 'OPEN')) { //Activity
                            child.getHistory().forEach(e => {
                                if (e.state === 'OPEN') {
                                    count++
                                }
                            });
                        } else { //Event
                            child.getHistory().forEach(e => {
                                if (e.state === 'CLOSED') {
                                    count++
                                }
                            });
                        }
                        if (count > 1) {
                            deviations.push(new MultiExecutionDeviation(outOfOrderElement, count))
                        }
                    }
                });
                //If we decide to propagate overlap, we can work with it here
                break;
            case 'EXCLUSIVE':
                //-INCOMPLETE deviation-
                //If the parent should be already closed, then the opened children suggesting IncompleteDeviations 
                //even if they are not on the correct branch
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }
                //-MULTIEXECUTION and INCORRECTBRANCH deviations-
                //Except a very special condition (see thesis), the children's compliance can be OoO only if they
                //are non-intended branches and they have been (at least partially) executed, thus we can create
                //an IncorrectBranchExecution for each of them (including the special condition as well)
                outOfOrder.forEach(outOfOrderElement => {
                    var history = this.egsm_model.stages.get(outOfOrderElement).getHistory()
                    var count = 0
                    if (history.some(e => e.state === 'OPEN')) { //Activity
                        history.forEach(e => {
                            if (e.state === 'OPEN') {
                                count++
                            }
                        });
                    } else { //Event
                        history.forEach(e => {
                            if (e.state === 'CLOSED') {
                                count++
                            }
                        });
                    }
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count))
                    } else {
                        deviations.push(new IncorrectBranchDeviation(outOfOrderElement))
                    }  
                });

                //Finally for each skipped branches a SkipDeviation instance is created
                //Are the branches actually marked as skipped?
                skipped.forEach(skippedElement => {
                    deviations.push(new SkipDeviation([skippedElement], 'NA'))
                    this.egsm_model.stages.get(skippedElement).propagateCondition('SHOULD_BE_CLOSED')
                });
                break;
            case 'INCLUSIVE':
                //-INCOMPLETE deviation-
                //If the parent stage is supposed to be closed than we can create an IncompleteExecution deviation instance
                //for each opened activity
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }

                //-MULTIEXECUTION and INCORRECTBRANCH deviations-
                outOfOrder.forEach(outOfOrderElement => {
                    var history = this.egsm_model.stages.get(outOfOrderElement).getHistory()
                    var count = 0
                    if (history.some(e => e.state === 'OPEN')) { //Activity
                        history.forEach(e => {
                            if (e.state === 'OPEN') {
                                count++
                            }
                        });
                    } else { //Event
                        history.forEach(e => {
                            if (e.state === 'CLOSED') {
                                count++
                            }
                        });
                    }
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count))
                    } else {
                        deviations.push(new IncorrectBranchDeviation(outOfOrderElement))
                    }  
                });

                //-SKIP deviation-
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    // without the condition, we are not able to tell which one should have opened
                }
                break;
            case 'LOOP':
                //In this case there is no deviation detection, but we need to propagate the conditions to the child, 
                //which is always an ITERATION block
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }
                break;
            case 'ITERATION':
                //For each OutOfOrder stage we can create an IncorrectExecutionSequence instance
                outOfOrder.forEach(outOfOrderElement => {
                    deviations.push(new IncorrectExecutionSequenceDeviation([outOfOrderElement]))
                });
                //It is possible that A1 has been skipped, so if there is any 'skipped' element then we 
                //can create a Skipdeviation instance and propagate the 'SHOULD_BE_CLOSED' condition
                skipped.forEach(skippedElement => {
                    deviations.push(new SkipDeviation([skippedElement], 'NA'))
                    this.egsm_model.stages.get(skippedElement).propagateCondition('SHOULD_BE_CLOSED')
                });
                //Finally, if the parent stage already should be closed, then for each opened children we
                //can create an IncompleteDeviation for each 'opened' child
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }
                break;
        }
        console.log('stageDeviations:' + deviations)
        return deviations
    }
}

module.exports = {
    ProcessPerspective,
    SkipDeviation,
    OverlapDeviation,
    IncorrectExecutionSequenceDeviation,
    IncompleteDeviation,
    MultiExecutionDeviation,
    IncorrectBranchDeviation,
}