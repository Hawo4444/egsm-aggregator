const { BpmnModel } = require("./bpmn-model")
const { EgsmModel } = require("./egsm-model")
const fs = require('fs');
const debugLog = fs.createWriteStream('algorithm.log', { flags: 'w' });

/**
 * Deviation superclass to represent one instance of Deviation detected in the eGSM model
 */
class Deviation {
    constructor(type, blockA, blockB, parentIndex, iterationIndex) {
        this.type = type
        this.block_a = blockA
        this.block_b = blockB
        this.parentIndex = parentIndex
        this.iterationIndex = iterationIndex
    }
}

/**
 * SkipDeviation is a type of deviation when in a sequence of stages one or more stage has been skipped, potentially causing the upcoming stage to be OutOfOrder
 */
class SkipDeviation extends Deviation {
    /**
     * @param {String[]} skipped The skipped stage(s) 
     * @param {String} outOfOrder The upcoming stage after the skipped sequence (OutOfOrder Stage)
     * @param {Number} parentIndex The parent stage's open-close pair index this deviation belongs to
     * @param {Number} iterationIndex The closest iteration index this deviation belongs to (optional)
     */
    constructor(skipped, outOfOrder, parentIndex, iterationIndex) {
        super('SKIPPED', skipped, outOfOrder, parentIndex, iterationIndex)
    }
}

/**
 * OverlapDeviation is a type of deviation when a stage overlaps with another block of stages, potentially causing the upcoming stage to be OutOfOrder
 */
class OverlapDeviation extends Deviation {
    /**
     * @param {String[]} overlapped The stage(s) that were executed after the stage that caused the overlap 
     * @param {String} open The stage that was supposed to be closed, but was not
     * @param {Number} parentIndex The parent stage's open-close pair index this deviation belongs to
     * @param {Number} iterationIndex The closest iteration index this deviation belongs to (optional)
     */
    constructor(overlapped, open, parentIndex, iterationIndex) {
        super('OVERLAP', overlapped, open, parentIndex, iterationIndex)
    }
}

/**
 * IncorrectExecutionSequenceDeviation is a type of Deviation when a group of tasks has not been executed on the desired sequence
 */
class IncorrectExecutionSequenceDeviation extends Deviation {
    /**
     * @param {String} skipped ID-s of the affected Block
     * @param {String} origin ID-s of the stage before the originally skipped block got executed
     * @param {Number} parentIndex The parent stage's open-close pair index this deviation belongs to
     * @param {Number} iterationIndex The closest iteration index this deviation belongs to (optional)
     */
    constructor(skipped, origin, parentIndex, iterationIndex) {
        super('INCORRECT_EXECUTION', skipped, origin, parentIndex, iterationIndex)
    }
}

/**
 * IncompleteDeviation is a type of Deviation when a Stage has been opened, but not closed, suggesting that the its execution is not complete
 */
class IncompleteDeviation extends Deviation {
    /**
     * @param {String} block ID of the problematic Stage
     * @param {Number} parentIndex The parent stage's open-close pair index this deviation belongs to
     * @param {Number} iterationIndex The closest iteration index this deviation belongs to (optional)
     */
    constructor(block, parentIndex, iterationIndex) {
        super('INCOMPLETE', block, null, parentIndex, iterationIndex)
    }
}

/**
 * MultiExecutionDeviation is a type of Deviation when one stage has been executed multiple times (while it was intended once only)
 */
class MultiExecutionDeviation extends Deviation {
    /**
     * @param {String} block ID of the problematic Stage 
     * @param {Number} executionCount Number of times the stage was executed
     * @param {Number} parentIndex The parent stage's open-close pair index this deviation belongs to
     * @param {Number} iterationIndex The closest iteration index this deviation belongs to (optional)
     */
    constructor(block, executionCount, parentIndex, iterationIndex) {
        super('MULTI_EXECUTION', block, null, parentIndex, iterationIndex)
        this.executionCount = executionCount
    }
}

/**
 * IncorrectBranchDeviation is a type of Deviation happens when in an Exclusive or Inclusive block the wrong Branch has been selected
 */
class IncorrectBranchDeviation extends Deviation {
    /**
     * @param {String} executed ID of the actually executed Sequence
     * @param {Number} parentIndex The parent stage's open-close pair index this deviation belongs to
     * @param {Number} iterationIndex The closest iteration index this deviation belongs to (optional)
     */
    constructor(executed, parentIndex, iterationIndex) {
        super('INCORRECT_BRANCH', executed, null, parentIndex, iterationIndex)
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
        this.egsm_model.stages.forEach(stage => stage.cleanPropagations())
        var deviations = []
        for (var key in this.egsm_model.model_roots) {
            deviations.concat(this._analyzeStage(this.egsm_model.model_roots[key], deviations))
            debugLog.write('Starting analysis\n____________________________________________________________________________\n');
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
    _analyzeRecursive(stage, discoveredDeviations, closestParentIteration = null) {
        var currentStage = this.egsm_model.stages.get(stage)
        if (currentStage.type === 'ITERATION') {
            closestParentIteration = currentStage
        }
        var children = currentStage.children
        var deviations = discoveredDeviations
        for (var child in children) {
            deviations = this._analyzeStage(children[child], deviations, closestParentIteration)
            this._analyzeRecursive(children[child], deviations, closestParentIteration)
        }

        return deviations
    }

    /**
     * Analyses a Single Stage regarding Deviations
     * Should be called internally only
     * @param {String} stage ID of the current Stage 
     * @param {Deviation[]} discoveredDeviations Array containing the already discovered Deviations
     * @param {EgsmStage} closestParentIteration Iteration stage that is the closest parent of the current stage, if one exists
     * @returns An array of Deviation instances, containing the content of 'discoveredDeviations' argument and the freshly discovered Deviations
     */
    _analyzeStage(stage, discoveredDeviations, closestParentIteration) {
        console.log('analyze stage:' + stage)
        debugLog.write('Analysing stage ' + stage + '\n')
        var deviations = discoveredDeviations
        var currentStage = this.egsm_model.stages.get(stage)
        var currentStageOpenClosePairs = currentStage.getOpenClosePairs()

        if (closestParentIteration && closestParentIteration.getOpenClosePairs().length > 0) {//TODO: save this to a variable not to rerun it
            debugLog.write('*is in iteration, count ' + closestParentIteration.getOpenClosePairs().length + '\n')
            for (var iterationPair of closestParentIteration.getOpenClosePairs()) { //Loop through iterations
                var parentPairIndex = 0
                var filteredCurrentStageOpenClosePairs = currentStageOpenClosePairs.filter(pair => pair.open > iterationPair.open &&
                    (iterationPair.close === null || pair.open < iterationPair.close))
                if (filteredCurrentStageOpenClosePairs.length > 0) {
                    debugLog.write('*stage opened in current iteration \n')
                    for (var parentPair of filteredCurrentStageOpenClosePairs) {
                        debugLog.write('*analysing iteration ' + parentPairIndex + ', parent opening ' + parentPairIndex + '\n')
                        this._findDeviations(deviations, stage, currentStage, iterationPair, parentPair, parentPairIndex)
                        parentPairIndex++
                    }
                } else {
                    debugLog.write('*no openings in iteration \n')
                    this._findDeviations(deviations, stage, currentStage, iterationPair, null, 0)
                }
            }
        } else {
            debugLog.write('*is NOT in iteration \n')
            if (currentStageOpenClosePairs.length > 0) {
                var parentPairIndex = 0
                for (var parentPair of currentStage.getOpenClosePairs()) {
                    debugLog.write('*analysing parent opening ' + parentPairIndex + '\n')
                    this._findDeviations(deviations, stage, currentStage, null, parentPair, parentPairIndex)
                    parentPairIndex++
                }
            } else {
                debugLog.write('*analysing stage that did not open \n')
                this._findDeviations(deviations, stage, currentStage, null, null, 0)
            }
        }

        console.log('stageDeviations:' + deviations)
        return deviations
    }

    _findDeviations(deviations, stage, currentStage, iterationPair, parentPair, parentPairIndex) {
        //now we are checking each stage multiple times, between openings and closing
        var iterationIndex = iterationPair ? iterationPair.index : -1


        //If the Stage is unopened and has been added to a SkipDeviation as 'skipped activity' then it means
        //that no substage has been opened neither, so the evaluation of children is not necessary
        /*for (var key in deviations) {
            if (deviations[key].constructor.name == 'SkipDeviation') {
                if (deviations[key].block_a.includes(stage)) {
                    return deviations
                }
            }
        }*/
        //If the Stage is UNOPENED, but not included in any SkipDeviation instance means that the stage
        //has not been executed, but it is intended (e.g.: Another branch has been executed and this was done correctly)
        //In this case there is no need to evaluate the children, since all of them will be in default state too
        /*if (currentStage.state == 'UNOPENED') {
            return deviations
        }*/
        var open = new Set()
        var unopened = new Set()
        var skipped = new Set()
        var outOfOrder = new Set()
        var children = this.egsm_model.stages.get(stage).children
        for (var key in children) {
            if (this.egsm_model.stages.get(children[key]).getLatestChange(parentPair?.close).state === 'OPEN') {
                open.add(children[key])
            }
            else if (this.egsm_model.stages.get(children[key]).getLatestChange(parentPair?.close).state === 'UNOPENED') {
                unopened.add(children[key])
            }
            if (this.egsm_model.stages.get(children[key]).getLatestChange(parentPair?.close).compliance === 'SKIPPED') {
                skipped.add(children[key])
            }
            else if (this.egsm_model.stages.get(children[key]).getLatestChange(parentPair?.close).compliance === 'OUTOFORDER') {
                outOfOrder.add(children[key])
            }
        }

        //The children have to be evaluated
        //Evaluation procedure depends on the type of the parent Stage
        switch (currentStage.type) {
            case 'SEQUENCE':
                this._propagateShouldBeClosed(currentStage, parentPair)
                //-OVERLAP and INCOMPLETE deviations-
                var processFlow = this._getProcessFlow(children, parentPair)
                for (let i = 0; i < processFlow.length; i++) {
                    let item = processFlow[i];
                    if (item.state === "OPEN") {
                        let overlapped = []
                        let foundClosing = false
                        let closingTime = null
                        let openingTime = item.timestamp
                        for (let j = i + 1; j < processFlow.length; j++) {
                            let nextItem = processFlow[j]
                            if (nextItem.state === "OPEN") {
                                overlapped.push(nextItem.id);
                            } else if (nextItem.state === "CLOSED" && item.id === nextItem.id) {
                                foundClosing = true
                                closingTime = nextItem.timestamp
                                break
                            }
                        }
                        if (overlapped.length > 0) {
                            overlapped = this.extractActivitiesFromOverlapped(overlapped, openingTime, closingTime)
                            //If the overlap is caused by non-basic stage, we could propagate some condition to find the specific cause
                            deviations.push(new OverlapDeviation(overlapped, item.id, parentPairIndex, iterationIndex))
                            this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED')
                            if (!foundClosing) {
                                deviations.push(new IncompleteDeviation(item.id, parentPairIndex, iterationIndex))
                            }
                        } else if (!foundClosing) {
                            var stage = this.egsm_model.stages.get(item.id)
                            if ((stage?.parent && this.egsm_model.stages.get(stage.parent).propagated_conditions.has('SHOULD_BE_CLOSED'))) {
                                deviations.push(new IncompleteDeviation(item.id, parentPairIndex, iterationIndex))
                                this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED')
                            }
                        }
                    }
                }

                //-MULTIEXECUTION deviation-
                outOfOrder.forEach(outOfOrderElement => {
                    var count = processFlow.filter(item => item.id === outOfOrderElement && item.state === "OPEN").length;
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex))
                    }
                });

                //-INCORRECTEXECUTIONSEQUENCE and SKIP deviation-
                var skippings = new Map() //OoO stage -> skipped sequence (skipped stages later extended by Unopened Stages before the Skipped one)
                currentStage.children.forEach(childId => {
                    var skippedFound = false
                    var openOutOfOrderFound = false
                    var previousStage = null
                    var firstFound = false //TODO: could consider getting rid of this depending on how the engine resets the inner stages
                    for (let i = 0; i < processFlow.length; i++) {
                        if (processFlow[i].id === childId) {
                            if (!firstFound) {
                                firstFound = true
                                if (processFlow[i].state === 'UNOPENED' && processFlow[i].compliance === 'ONTIME') {
                                    continue;
                                }
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
                                        if (processFlow[j].state === 'OPEN') {
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
                            deviations.push(new IncorrectExecutionSequenceDeviation(childId, previousStage, parentPairIndex, iterationIndex))
                        } else {
                            //If there is any SKIPPED stage among children it suggests, that at least one child activity has been skipped
                            //furthermore, at least one OoO child stage must exist                     
                            outOfOrder.forEach(outOfOrderElement => {
                                if (this.egsm_model.stages.get(outOfOrderElement).direct_predecessor == childId) {
                                    skippings.set(outOfOrderElement, [childId])
                                    //skipped.delete(skippedElement)
                                    unopened.delete(childId)
                                    this.egsm_model.stages.get(childId).propagateCondition('SHOULD_BE_CLOSED')
                                }
                            });
                            //Extending skipped sequences by trying to include UNOPENED stages
                            var finalized = false
                            while (!finalized) {
                                finalized = true
                                unopened.forEach(unopenedElement => {
                                    for (var [_, entry] of skippings.entries()) {
                                        if (this.egsm_model.stages.get(entry[0]).direct_predecessor === unopenedElement) {
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
                    deviations.push(new SkipDeviation(entry, key, parentPairIndex, iterationIndex))
                }
                break;
            case 'PARALLEL':
                //If the parent stage is should be closed then it means that at least one of the children processes
                //has not been executed completely or at all, so we can create IncompleteExecution and SkipDeviation instances 
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    unopened.forEach(unopenedElement => {
                        deviations.push(new SkipDeviation([unopenedElement], 'NONE', parentPairIndex, iterationIndex))
                        this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }

                outOfOrder.forEach(outOfOrderElement => {
                    var count = 0
                    this.egsm_model.stages.get(outOfOrderElement).getHistory().forEach(e => {
                        if (e.state === 'OPEN') {
                            count++
                        }
                    });
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex))
                    }
                });
                break;
            case 'EXCLUSIVE':
                //-INCOMPLETE deviation-
                //If the parent should be already closed, then the opened children suggesting IncompleteDeviations 
                //even if they are not on the correct branch
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }
                //-MULTIEXECUTION and INCORRECTBRANCH deviations-               
                outOfOrder.forEach(outOfOrderElement => {
                    var stage = this.egsm_model.stages.get(outOfOrderElement)
                    var count = 0
                    var firstOpening = null
                    stage.getHistory().filter(e => e.timestamp > parentPair.open && e.timestamp < parentPair.close).forEach(e => {
                        if (e.state === 'OPEN') {
                            count++
                            if (!firstOpening) {
                                firstOpening = e
                            }
                        }
                    });
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex))
                        if (firstOpening?.status === 'OUTOFORDER') {
                            var condition = stage.getConditionAt(firstOpening.timestamp);
                            if (condition?.value === false) {
                                deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex));
                            }
                        }
                    } else {
                        var condition = stage.getConditionAt(stage.getLatestOpening().timestamp)
                        if (condition === false) {
                            deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex))
                        }
                    }
                });

                //Finally for each skipped branches a SkipDeviation instance is created
                //Are the branches actually marked as skipped?????????????????????????????????????????????????????????????????????????????????????????
                skipped.forEach(skippedElement => {
                    deviations.push(new SkipDeviation([skippedElement], 'NONE', parentPairIndex, iterationIndex))
                    this.egsm_model.stages.get(skippedElement).propagateCondition('SHOULD_BE_CLOSED')
                });
                break;
            case 'INCLUSIVE':
                //-INCOMPLETE deviation-
                //If the parent stage is supposed to be closed than we can create an IncompleteExecution deviation instance
                //for each opened activity
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    open.forEach(openElement => {
                        deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex))
                        this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }

                //-MULTIEXECUTION and INCORRECTBRANCH deviations-
                outOfOrder.forEach(outOfOrderElement => {
                    var history = this.egsm_model.stages.get(outOfOrderElement).getHistory().filter(e => e.timestamp > parentPair.open && e.timestamp < parentPair.close)
                    var count = 0
                    var firstOpening = null
                    history.forEach(e => {
                        if (e.state === 'OPEN') {
                            count++
                            if (!firstOpening) {
                                firstOpening = e
                            }
                        }
                    });
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex))
                        if (firstOpening?.status === 'OUTOFORDER') {
                            deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex));
                        }
                    } else {
                        deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex))
                    }
                });

                //-SKIP deviation-
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    unopened.forEach(unopenedElement => {
                        var condition = this.egsm_model.stages.get(unopenedElement).getLatestCondition(parentPair.close)
                        if (condition?.value === true) {
                            deviations.push(new SkipDeviation([unopenedElement], 'NONE', parentPairIndex, iterationIndex))
                            this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED')
                        }
                    });
                }
                break;
            case 'LOOP':
                //In this case there is no deviation detection, but we need to propagate the conditions to the child, 
                //which is always an ITERATION block
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    currentStage.children.forEach(child => {
                        //deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex))
                        this.egsm_model.stages.get(child).propagateCondition('SHOULD_BE_CLOSED')
                    });
                }
                break;
            case 'ITERATION':
                //Incomplete iteration - open iteration and has should be closed
                //Skipped iteration - unopened iteration and parent loop has skipped OR closed iteration parent loop has should be closed
                if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
                    if (currentStage.getLatestChange(parentPair?.close).state === 'OPEN') {
                        //TODO: To get the iteration index in front end, pass parentPairIndex as iterationIndex - there is probably a better solution to this
                        deviations.push(new IncompleteDeviation(currentStage.id, parentPairIndex, parentPairIndex))
                        //this.egsm_model.stages.get(currentStage.id).propagateCondition('SHOULD_BE_CLOSED')
                    }
                    /*if (open.size > 0) {
                        open.forEach(openElement => {
                            //Incomplete branch - one of the branches is opened and the parent loop should be closed - only when we have incomplete iteration
                            deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex))
                            this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED')
                        });
                    }*/

                    //if (currentStage.state === 'UNOPENED' ) {//TODO, check how this behaves .getLatestChange(parentPair?.close + 0.01? or similar), otherwise =< in method
                    if (parentPair?.close === null && currentStage.state === 'UNOPENED') { //now checking current state, so depends if new iteration can start from unopened 
                        deviations.push(new SkipDeviation([currentStage.id], 'NONE', parentPairIndex + 1, iterationIndex))
                    } else if (currentStage.getLatestChange(parentPair?.close).state === 'CLOSED') {
                        //For last ITERATION to complete correctly, a2 should be unopened and a1 closed
                        if (this.egsm_model.stages.get(currentStage.children[1]).getLatestChange(parentPair?.close).state !== 'UNOPENED') {
                            if (parentPairIndex === currentStage.getOpenClosePairs().length - 1) {
                                //TODO: To get the iteration index in front end, pass parentPairIndex as iterationIndex - there is probably a better solution to this
                                deviations.push(new SkipDeviation([currentStage.id], 'NONE', parentPairIndex + 1, parentPairIndex + 1))
                                //this.egsm_model.stages.get(currentStage.id).propagateCondition('SHOULD_BE_CLOSED')
                            }
                        }
                    }
                }

                //Overlap
                var processFlow = this._getProcessFlow(children, parentPair)
                for (let i = 0; i < processFlow.length; i++) {
                    var item = processFlow[i];
                    if (item.state === "OPEN") {
                        var overlapped = []
                        var foundClosing = false
                        var closingTime = null
                        var openingTime = item.timestamp
                        for (let j = i + 1; j < processFlow.length; j++) {
                            var nextItem = processFlow[j]
                            if (nextItem.state === "OPEN") {
                                overlapped.push(nextItem.id);
                            } else if (nextItem.state === "CLOSED" && item.id === nextItem.id) {
                                foundClosing = true
                                closingTime = nextItem.timestamp //===null ? parentPair?.close : nextItem.timestamp
                                break
                            }
                        }
                        if (overlapped.length > 0) {
                            overlapped = this.extractActivitiesFromOverlapped(overlapped, openingTime, closingTime)
                            deviations.push(new OverlapDeviation(overlapped, item.id, parentPairIndex, iterationIndex))
                            this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED') //TODO: this may depend on the order!
                            if (!foundClosing) {
                                deviations.push(new IncompleteDeviation(item.id, parentPairIndex, iterationIndex))
                            }
                        } else if (!foundClosing) {
                            var stage = this.egsm_model.stages.get(item.id)
                            if ((stage?.parent && this.egsm_model.stages.get(stage.parent).propagated_conditions.has('SHOULD_BE_CLOSED'))) {
                                deviations.push(new IncompleteDeviation(item.id, parentPairIndex, iterationIndex))
                                stage.propagateCondition('SHOULD_BE_CLOSED')
                            }
                        }
                    }
                }

                //Skipped branch - a1 will be skipped at the end of the iteration
                //Incorrect branch - only when we have a1 skipped and then a2, altough a1 may still open in which case incorrect order as well
                skipped.forEach(skippedElement => {
                    deviations.push(new SkipDeviation([skippedElement], 'NONE', parentPairIndex, iterationIndex))
                    this.egsm_model.stages.get(skippedElement).propagateCondition('SHOULD_BE_CLOSED')
                    //onlu a1 can be skipped, so if we have an OoO element, we know a2 has opened hence incorrect branch
                    if (outOfOrder.length > 0) {
                        deviations.push(new IncorrectBranchDeviation(outOfOrder[0], parentPairIndex, iterationIndex))
                    }
                });

                //-MULTIEXECUTION deviation-
                //Multi execution - within the iteration, count openings
                outOfOrder.forEach(outOfOrderElement => {
                    var count = processFlow.filter(item => item.id === outOfOrderElement && item.state === "OPEN").length;
                    if (count > 1) {
                        deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex))
                    }
                });

                //-INCORRECTEXECUTIONSEQUENCE deviation-
                //Incorrect order - same as in sequence, except now it needs to be a1 that is skipped first and then out of order, a2 will then also be outoforder without a chance of ever being ontime
                //TODO: could have simpler logic because of stricter order
                var skippings = new Map() //OoO stage -> skipped sequence
                currentStage.children.forEach(childId => {
                    var skippedFound = false
                    var openOutOfOrderFound = false
                    var previousStage = null
                    var firstFound = false //TODO: could consider getting rid of this depending on how the engine resets the inner stages
                    for (let i = 0; i < processFlow.length; i++) {
                        if (processFlow[i].id === childId) {
                            if (!firstFound) {
                                firstFound = true
                                if (processFlow[i].state === 'UNOPENED' && processFlow[i].compliance === 'ONTIME') {
                                    continue;
                                }
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
                                        if (processFlow[j].state === 'OPEN') {
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
                            //TODO: passing parentPairIndex as iterationIndex to get the correct iteration index in frontend, could probably be done better
                            deviations.push(new IncorrectExecutionSequenceDeviation(currentStage.id, 'NONE', parentPairIndex, parentPairIndex))
                            /* //If we want to do more with this, like add arrows, go with this version but needs to be handled in frontend potentially
                            //Also use this.egsm_model.stages.get(childId).children[0] and this.egsm_model.stages.get(previousStage).children[0],
                            //if there is only one child as branches are wrapped in sequence blocks, needs futher consideration if branch has multiple children
                            deviations.push(new IncorrectExecutionSequenceDeviation(childId, previousStage, parentPairIndex, parentPairIndex))*/
                        } /*else {      
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
                        }*/
                    }
                });
                //For each OutOfOrder stage we can create an IncorrectExecutionSequence instance
                /*outOfOrder.forEach(outOfOrderElement => {
                    deviations.push(new IncorrectExecutionSequenceDeviation([outOfOrderElement]))
                });*/

                break;
        }
    }

    _propagateShouldBeClosed(stage, parentPair) {
        const childStages = (stage.children || []).map(id => this.egsm_model.stages.get(id));
        if (childStages.length === 0) return;

        let lastStage = null;
        const predecessorIds = new Set(childStages.map(s => s.direct_predecessor).filter(id => id));
        for (const childStage of childStages) {
            if (!predecessorIds.has(childStage.id)) {
                lastStage = childStage;
                break;
            }
        }

        let currentStage = lastStage;
        let foundOpen = false;

        while (currentStage) {
            const latestChange = currentStage.getLatestChange(parentPair?.close);
            if (!foundOpen && latestChange && latestChange.state !== 'UNOPENED') {
                foundOpen = true;
            } else if (foundOpen) {
                currentStage.propagateCondition('SHOULD_BE_CLOSED');
            }

            if (!currentStage.direct_predecessor) break;
            currentStage = this.egsm_model.stages.get(currentStage.direct_predecessor);
        }
    }

    _findParentIteration(stage) {
        let currentStage = stage;
        while (currentStage.parent && currentStage.parent !== 'NONE' && currentStage.parent !== 'NA') {
            currentStage = this.egsm_model.stages.get(currentStage.parent);
            if (currentStage.type === 'ITERATION') {
                return currentStage;
            }
        }
        return null;
    }

    _getProcessFlow(children, pair) {
        let processFlow = [];
        if (pair == null) {
            return processFlow;
        }
        for (let key in children) {
            const history = this.egsm_model.stages.get(children[key]).getHistory();
            for (let change of history) {
                if (change.timestamp < pair.open) {
                    continue;
                }
                if (pair.close != null && change.timestamp > pair.close) {
                    break;
                }

                processFlow.push({
                    timestamp: change.timestamp,
                    id: children[key],
                    status: change.status,
                    state: change.state,
                    compliance: change.compliance
                });
            }
        }

        processFlow.sort((a, b) => {
            if (a.timestamp === null) return 1;
            if (b.timestamp === null) return -1;
            return a.timestamp - b.timestamp;
        });

        return processFlow;
    }

    extractActivitiesFromOverlapped(overlapped, openingTime, closingTime) {
        const activities = [];
        for (const item of overlapped) {
            this.collectActivities(item, activities, openingTime, closingTime, true);
        }
        return activities;
    }

    collectActivities(item, activities, openingTime, closingTime, isTopLevel = false) {
        const stage = this.egsm_model.stages.get(item);
        if (!stage)
            return;

        if (stage.type === 'ACTIVITY' || stage.type === 'EXCEPTION') {
            if (isTopLevel || stage.getOpeningTimeBetween(openingTime, closingTime) !== null) {
                activities.push(item);
            }
        } else {
            if (stage.children && stage.children.length > 0) {
                for (const child of stage.children) {
                    this.collectActivities(child, activities, openingTime, closingTime, false);
                }
            }
        }
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