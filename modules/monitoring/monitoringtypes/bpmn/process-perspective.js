const { BpmnModel } = require("./bpmn-model")
const { EgsmModel } = require("./egsm-model")

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
        // Process tree traversal to find deviations
        const deviations = [];
        for (const key in this.egsm_model.model_roots) {
            const rootStage = this.egsm_model.model_roots[key];
            this._analyzeStage(rootStage, deviations);
            this._analyzeRecursive(rootStage, deviations);
        }

        // Update Status and State of BPMN Activities
        this.bpmn_model.resetModel();
        this.bpmn_model.applyEgsmStageArray(this.egsm_model.getStageInfoArray());

        // Apply deviations on the BPMN model
        deviations.forEach(element => {
            this.bpmn_model.applyDeviation(element);
        });

        return deviations;
    }

    /**
     * Recursive function to discover deviations
     * Should be called only internally
     * @param {String} stage ID of the current stage
     * @param {Deviation[]} discoveredDeviations Array containing the already discovered Deviations
     * @param {EgsmStage} closestParentIteration Iteration stage that is the closest parent of the current stage, if one exists
     * @returns An array of Deviation instances, containing the content of 'discoveredDeviations' argument and the freshly discovered Deviations
     */
    _analyzeRecursive(stage, discoveredDeviations, closestParentIteration = null) {
        const currentStage = this.egsm_model.stages.get(stage);
        const updatedParentIteration = currentStage.type === 'ITERATION' ? currentStage : closestParentIteration;

        currentStage.children.forEach(child => {
            this._analyzeStage(child, discoveredDeviations, updatedParentIteration);
            this._analyzeRecursive(child, discoveredDeviations, updatedParentIteration);
        });

        return discoveredDeviations;
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
        const currentStage = this.egsm_model.stages.get(stage);
        const currentStageOpenClosePairs = currentStage.getOpenClosePairs();
        let pairsToAnalyze = [];

        if (closestParentIteration && closestParentIteration.getOpenClosePairs().length > 0) {
            // Build pairs to analyze based on iteration context
            for (const iterationPair of closestParentIteration.getOpenClosePairs()) {
                const filteredPairs = currentStageOpenClosePairs.filter(pair =>
                    pair.open > iterationPair.open &&
                    (iterationPair.close === null || pair.open < iterationPair.close)
                );

                if (filteredPairs.length > 0) {
                    filteredPairs.forEach((parentPair, index) => {
                        pairsToAnalyze.push({ iterationPair, parentPair, parentPairIndex: index });
                    });
                } else {
                    pairsToAnalyze.push({ iterationPair, parentPair: null, parentPairIndex: 0 });
                }
            }
        } else {
            if (currentStageOpenClosePairs.length > 0) {
                currentStageOpenClosePairs.forEach((parentPair, index) => {
                    pairsToAnalyze.push({ iterationPair: null, parentPair, parentPairIndex: index });
                });
            } else {
                pairsToAnalyze.push({ iterationPair: null, parentPair: null, parentPairIndex: 0 });
            }
        }

        // Process all pairs
        pairsToAnalyze.forEach(({ iterationPair, parentPair, parentPairIndex }) => {
            this._findDeviations(discoveredDeviations, stage, currentStage, iterationPair, parentPair, parentPairIndex);
        });

        return discoveredDeviations;
    }

    _findDeviations(deviations, stage, currentStage, iterationPair, parentPair, parentPairIndex) {
        const iterationIndex = iterationPair ? iterationPair.index : -1;
        // Categorize children
        const childCategories = this._categorizeChildren(stage, parentPair);
        const { open, unopened, skipped, outOfOrder } = childCategories;

        // The children have to be evaluated
        // Evaluation procedure depends on the type of the parent Stage
        switch (currentStage.type) {
            case 'SEQUENCE':
                this._handleSequenceDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, childCategories);
                break;
            case 'PARALLEL':
                this._handleParallelDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, childCategories);
                break;
            case 'EXCLUSIVE':
                this._handleExclusiveDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, childCategories);
                break;
            case 'INCLUSIVE':
                this._handleInclusiveDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, childCategories);
                break;
            case 'LOOP':
                this._handleLoopDeviations(currentStage);
                break;
            case 'ITERATION':
                this._handleIterationDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, childCategories);
                break;
        }
    }

    /**
     * Categorize children stages
     */
    _categorizeChildren(stage, parentPair) {
        const open = new Set();
        const unopened = new Set();
        const skipped = new Set();
        const outOfOrder = new Set();
        const children = this.egsm_model.stages.get(stage).children;

        children.forEach(childId => {
            const childStage = this.egsm_model.stages.get(childId);
            const latestChange = childStage.getLatestChange(parentPair?.close);

            // Categorize by state
            if (latestChange.state === 'OPEN') {
                open.add(childId);
            } else if (latestChange.state === 'UNOPENED') {
                unopened.add(childId);
            }

            // Categorize by compliance
            if (latestChange.compliance === 'SKIPPED') {
                skipped.add(childId);
            } else if (latestChange.compliance === 'OUTOFORDER') {
                outOfOrder.add(childId);
            }
        });

        return { open, unopened, skipped, outOfOrder };
    }

    _handleSequenceDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, { open, unopened, skipped, outOfOrder }) {
        this._propagateShouldBeClosed(currentStage, parentPair);

        // OVERLAP and INCOMPLETE deviations
        this._processOverlapAndIncomplete(deviations, currentStage.children, parentPair, parentPairIndex, iterationIndex);

        // MULTIEXECUTION deviation
        this._processMultiExecution(deviations, currentStage, parentPair, outOfOrder, parentPairIndex, iterationIndex);

        // INCORRECTEXECUTIONSEQUENCE and SKIP deviations
        const skippings = this._processSequenceSkippings(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, unopened, outOfOrder);

        // Handle remaining unopened stages if parent should be closed
        this._handleRemainingUnopened(currentStage, unopened, skippings);

        // Create SkipDeviation instances
        for (const [key, entry] of skippings) {
            deviations.push(new SkipDeviation(entry, key, parentPairIndex, iterationIndex));
        }
    }

    _handleParallelDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, { open, unopened, outOfOrder }) {
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            // Process unopened and open stages together
            unopened.forEach(unopenedElement => {
                deviations.push(new SkipDeviation([unopenedElement], 'NONE', parentPairIndex, iterationIndex));
                this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED');
            });

            open.forEach(openElement => {
                deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex));
                this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED');
            });
        }

        this._processMultiExecutionFromHistory(deviations, outOfOrder, parentPairIndex, iterationIndex);
    }

    _handleExclusiveDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, { open, skipped, outOfOrder }) {
        // INCOMPLETE deviation
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            open.forEach(openElement => {
                deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex));
                this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED');
            });
        }

        // MULTIEXECUTION and INCORRECTBRANCH deviations
        this._processExclusiveOutOfOrder(deviations, outOfOrder, parentPair, parentPairIndex, iterationIndex);

        // SKIP deviations
        skipped.forEach(skippedElement => {
            deviations.push(new SkipDeviation([skippedElement], 'NONE', parentPairIndex, iterationIndex));
            this.egsm_model.stages.get(skippedElement).propagateCondition('SHOULD_BE_CLOSED');
        });
    }

    _handleInclusiveDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, { open, unopened, outOfOrder }) {
        // INCOMPLETE deviation
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            open.forEach(openElement => {
                deviations.push(new IncompleteDeviation(openElement, parentPairIndex, iterationIndex));
                this.egsm_model.stages.get(openElement).propagateCondition('SHOULD_BE_CLOSED');
            });
        }

        // MULTIEXECUTION and INCORRECTBRANCH deviations
        this._processInclusiveOutOfOrder(deviations, outOfOrder, parentPair, parentPairIndex, iterationIndex);

        // SKIP deviation
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            unopened.forEach(unopenedElement => {
                const condition = this.egsm_model.stages.get(unopenedElement).getLatestCondition(parentPair.close);
                if (condition === true) {
                    deviations.push(new SkipDeviation([unopenedElement], 'NONE', parentPairIndex, iterationIndex));
                    this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED');
                }
            });
        }
    }

    _handleLoopDeviations(currentStage) {
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            currentStage.children.forEach(child => {
                this.egsm_model.stages.get(child).propagateCondition('SHOULD_BE_CLOSED');
            });
        }
    }

    _handleIterationDeviations(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, { skipped, outOfOrder }) {
        this._processIterationCompletionDeviations(deviations, currentStage, parentPair, parentPairIndex);

        // OVERLAP deviation
        this._processOverlapAndIncomplete(deviations, currentStage.children, parentPair, parentPairIndex, iterationIndex);

        // SKIPPED and INCORRECT branch deviations
        this._processIterationSkippedBranches(deviations, skipped, parentPairIndex, iterationIndex);

        // MULTIEXECUTION deviation
        this._processMultiExecution(deviations, currentStage, parentPair, outOfOrder, parentPairIndex, iterationIndex);

        // INCORRECTEXECUTIONSEQUENCE deviation
        this._processIterationIncorrectSequence(deviations, currentStage, parentPair, parentPairIndex);
    }

    // Helper methods for processing specific deviation types
    _processOverlapAndIncomplete(deviations, children, parentPair, parentPairIndex, iterationIndex) {
        const processFlow = this._getProcessFlow(children, parentPair);

        for (let i = 0; i < processFlow.length; i++) {
            const item = processFlow[i];
            if (item.state === "OPEN") {
                const { overlapped, foundClosing, closingTime, openingTime } = this._findOverlappedItems(processFlow, i, item);

                if (overlapped.length > 0) {
                    const extractedActivities = this.extractActivitiesFromOverlapped(overlapped, openingTime, closingTime);
                    deviations.push(new OverlapDeviation(extractedActivities, item.id, parentPairIndex, iterationIndex));
                    this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED');

                    if (!foundClosing) {
                        deviations.push(new IncompleteDeviation(item.id, parentPairIndex, iterationIndex));
                    }
                } else if (!foundClosing) {
                    const stage = this.egsm_model.stages.get(item.id);
                    if (stage?.parent && this.egsm_model.stages.get(stage.parent).propagated_conditions.has('SHOULD_BE_CLOSED')) {
                        deviations.push(new IncompleteDeviation(item.id, parentPairIndex, iterationIndex));
                        this.egsm_model.stages.get(item.id).propagateCondition('SHOULD_BE_CLOSED');
                    }
                }
            }
        }
    }

    _findOverlappedItems(processFlow, startIndex, item) {
        const overlapped = [];
        let foundClosing = false;
        let closingTime = null;
        const openingTime = item.timestamp;

        for (let j = startIndex + 1; j < processFlow.length; j++) {
            const nextItem = processFlow[j];
            if (nextItem.state === "OPEN") {
                // Store timestamp to preserve chronological order
                overlapped.push({
                    id: nextItem.id,
                    timestamp: nextItem.timestamp
                });
            } else if (nextItem.state === "CLOSED" && item.id === nextItem.id) {
                foundClosing = true;
                closingTime = nextItem.timestamp;
                break;
            }
        }

        return { overlapped, foundClosing, closingTime, openingTime };
    }

    // For sequence and iteration stages - uses processFlow
    _processMultiExecution(deviations, currentStage, parentPair, outOfOrder, parentPairIndex, iterationIndex) {
        const processFlow = this._getProcessFlow(currentStage.children, parentPair);

        outOfOrder.forEach(outOfOrderElement => {
            const count = processFlow.filter(item => item.id === outOfOrderElement && item.state === "OPEN").length;
            if (count > 1) {
                deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex));
            }
        });
    }

    _processMultiExecutionFromHistory(deviations, outOfOrder, parentPairIndex, iterationIndex) {
        outOfOrder.forEach(outOfOrderElement => {
            const count = this.egsm_model.stages.get(outOfOrderElement)
                .getHistory()
                .filter(e => e.state === 'OPEN').length;

            if (count > 1) {
                deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex));
            }
        });
    }

    _processExclusiveOutOfOrder(deviations, outOfOrder, parentPair, parentPairIndex, iterationIndex) {
        outOfOrder.forEach(outOfOrderElement => {
            const stage = this.egsm_model.stages.get(outOfOrderElement);
            let count = 0;
            let firstOpening = null;

            stage.getHistory().filter(e => e.timestamp > parentPair.open && e.timestamp < parentPair.close).forEach(e => {
                if (e.state === 'OPEN') {
                    count++;
                    if (!firstOpening) {
                        firstOpening = e;
                    }
                }
            });

            if (count > 1) {
                deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex));
                if (firstOpening?.compliance === 'OUTOFORDER') {
                    const condition = stage.getConditionAt(firstOpening.timestamp);
                    if (condition === false) {
                        deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex));
                    }
                }
            } else {
                const condition = stage.getConditionAt(stage.getLatestOpening().timestamp);
                if (condition === false) {
                    deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex));
                }
            }
        });
    }

    _processInclusiveOutOfOrder(deviations, outOfOrder, parentPair, parentPairIndex, iterationIndex) {
        outOfOrder.forEach(outOfOrderElement => {
            const history = this.egsm_model.stages.get(outOfOrderElement).getHistory().filter(e => e.timestamp > parentPair.open && e.timestamp < parentPair.close);
            let count = 0;
            let firstOpening = null;

            history.forEach(e => {
                if (e.state === 'OPEN') {
                    count++;
                    if (!firstOpening) {
                        firstOpening = e;
                    }
                }
            });

            if (count > 1) {
                deviations.push(new MultiExecutionDeviation(outOfOrderElement, count, parentPairIndex, iterationIndex));
                if (firstOpening?.status === 'OUTOFORDER') {
                    deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex));
                }
            } else {
                deviations.push(new IncorrectBranchDeviation(outOfOrderElement, parentPairIndex, iterationIndex));
            }
        });
    }

    _processSequenceSkippings(deviations, currentStage, parentPair, parentPairIndex, iterationIndex, unopened, outOfOrder) {
        const skippings = new Map();
        const processFlow = this._getProcessFlow(currentStage.children, parentPair);

        currentStage.children.forEach(childId => {
            let skippedFound = false;
            let openOutOfOrderFound = false;
            let previousStage = null;
            let firstFound = false;

            for (let i = 0; i < processFlow.length; i++) {
                if (processFlow[i].id === childId) {
                    if (!firstFound) {
                        firstFound = true;
                        if (processFlow[i].state === 'UNOPENED' && processFlow[i].compliance === 'ONTIME') {
                            continue;
                        }
                    }
                    if (!skippedFound) {
                        if (processFlow[i].compliance !== 'SKIPPED') {
                            break;
                        } else {
                            skippedFound = true;
                        }
                    } else {
                        if (processFlow[i].compliance === 'OUTOFORDER') {
                            openOutOfOrderFound = true;
                            for (let j = i - 1; j >= 0; j--) {
                                if (processFlow[j].state === 'OPEN') {
                                    previousStage = processFlow[j].id;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                }
            }

            if (skippedFound) {
                if (openOutOfOrderFound) {
                    deviations.push(new IncorrectExecutionSequenceDeviation(childId, previousStage, parentPairIndex, iterationIndex));
                } else {
                    outOfOrder.forEach(outOfOrderElement => {
                        if (this.egsm_model.stages.get(outOfOrderElement).direct_predecessor == childId) {
                            skippings.set(outOfOrderElement, [childId]);
                            unopened.delete(childId);
                            this.egsm_model.stages.get(childId).propagateCondition('SHOULD_BE_CLOSED');
                        }
                    });

                    // Extending skipped sequences by trying to include UNOPENED stages
                    let finalized = false;
                    while (!finalized) {
                        finalized = true;
                        unopened.forEach(unopenedElement => {
                            for (const [_, entry] of skippings.entries()) {
                                if (this.egsm_model.stages.get(entry[0]).direct_predecessor === unopenedElement) {
                                    entry.unshift(unopenedElement);
                                    finalized = false;
                                    unopened.delete(unopenedElement);
                                }
                            }
                        });
                    }
                }
            }
        });

        return skippings;
    }

    _handleRemainingUnopened(currentStage, unopened, skippings) {
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            unopened.forEach(unopenedElement => {
                skippings.set(null, [unopenedElement]);
                this.egsm_model.stages.get(unopenedElement).propagateCondition('SHOULD_BE_CLOSED');
            });
        }

        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            const lastElement = [...unopened].find(candidate => {
                return ![...unopened].some(other =>
                    this.egsm_model.stages.get(other).direct_predecessor === candidate
                );
            });

            if (lastElement) {
                const sequence = [];
                let current = lastElement;
                while (current) {
                    sequence.push(current);
                    this.egsm_model.stages.get(current).propagateCondition('SHOULD_BE_CLOSED');
                    unopened.delete(current);

                    const predecessorId = this.egsm_model.stages.get(current).direct_predecessor;
                    if (unopened.has(predecessorId)) {
                        current = predecessorId;
                    } else {
                        current = null;
                    }
                }
                skippings.set(null, sequence);
            }
        }
    }

    _processIterationCompletionDeviations(deviations, currentStage, parentPair, parentPairIndex) {
        if (currentStage.propagated_conditions.has('SHOULD_BE_CLOSED')) {
            if (currentStage.getLatestChange(parentPair?.close).state === 'OPEN') {
                deviations.push(new IncompleteDeviation(currentStage.id, parentPairIndex, parentPairIndex));
            }

            if (parentPair?.close === null && currentStage.state === 'UNOPENED') {
                deviations.push(new SkipDeviation([currentStage.id], 'NONE', parentPairIndex + 1, iterationIndex));
            } else if (currentStage.getLatestChange(parentPair?.close).state === 'CLOSED') {
                if (this.egsm_model.stages.get(currentStage.children[1]).getLatestChange(parentPair?.close).state !== 'UNOPENED') {
                    if (parentPairIndex === currentStage.getOpenClosePairs().length - 1) {
                        deviations.push(new SkipDeviation([currentStage.id], 'NONE', parentPairIndex + 1, parentPairIndex + 1));
                    }
                }
            }
        }
    }

    _processIterationSkippedBranches(deviations, skipped, parentPairIndex, iterationIndex) {
        skipped.forEach(skippedElement => {
            deviations.push(new SkipDeviation([skippedElement], 'NONE', parentPairIndex, iterationIndex));
            this.egsm_model.stages.get(skippedElement).propagateCondition('SHOULD_BE_CLOSED');
        });
    }

    _processIterationIncorrectSequence(deviations, currentStage, parentPair, parentPairIndex) {
        const processFlow = this._getProcessFlow(currentStage.children, parentPair);

        currentStage.children.forEach(childId => {
            let skippedFound = false;
            let openOutOfOrderFound = false;
            let firstFound = false;

            for (let i = 0; i < processFlow.length; i++) {
                if (processFlow[i].id === childId) {
                    if (!firstFound) {
                        firstFound = true;
                        if (processFlow[i].state === 'UNOPENED' && processFlow[i].compliance === 'ONTIME') {
                            continue;
                        }
                    }
                    if (!skippedFound) {
                        if (processFlow[i].compliance !== 'SKIPPED') {
                            break;
                        } else {
                            skippedFound = true;
                        }
                    } else {
                        if (processFlow[i].compliance === 'OUTOFORDER') {
                            openOutOfOrderFound = true;
                            break;
                        }
                    }
                }
            }

            if (skippedFound && openOutOfOrderFound) {
                deviations.push(new IncorrectExecutionSequenceDeviation(currentStage.id, 'NONE', parentPairIndex, parentPairIndex));
            }
        });
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

    extractActivitiesFromOverlapped(overlappedItems, openingTime, closingTime) {
        const activities = [];
        for (const overlappedItem of overlappedItems) {
            this.collectActivitiesWithTiming(overlappedItem, activities, openingTime, closingTime);
        }

        // Sort activities by their opening time
        activities.sort((a, b) => {
            if (a.timestamp === null) return 1;
            if (b.timestamp === null) return -1;
            return a.timestamp - b.timestamp;
        });

        // Return just the activity IDs in time order
        return activities.map(activity => activity.id);
    }

    collectActivitiesWithTiming(overlappedItem, activities, openingTime, closingTime) {
        const stage = this.egsm_model.stages.get(overlappedItem.id);
        if (!stage) return;

        if (stage.type === 'ACTIVITY' || stage.type === 'EXCEPTION') {
            // If it's directly in overlapped, we already know it opened during overlap
            activities.push({
                id: overlappedItem.id,
                timestamp: overlappedItem.timestamp
            });
        } else {
            // For stages with children, recurse to find activities that opened during the overlap period
            if (stage.children && stage.children.length > 0) {
                for (const child of stage.children) {
                    this.collectActivitiesFromChildren(child, activities, openingTime, closingTime);
                }
            }
        }
    }

    collectActivitiesFromChildren(stageId, activities, openingTime, closingTime) {
        const stage = this.egsm_model.stages.get(stageId);
        if (!stage) return;

        if (stage.type === 'ACTIVITY' || stage.type === 'EXCEPTION') {
            // For children, we need to check if they actually opened during overlap
            const history = stage.getHistory();
            for (const change of history) {
                if (change.state === 'OPEN' &&
                    change.timestamp >= openingTime &&
                    (closingTime === null || change.timestamp <= closingTime)) {
                    activities.push({
                        id: stageId,
                        timestamp: change.timestamp
                    });
                }
            }
        } else {
            if (stage.children && stage.children.length > 0) {
                for (const child of stage.children) {
                    this.collectActivitiesFromChildren(child, activities, openingTime, closingTime);
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