var UUID = require("uuid");
var xml2js = require('xml2js');
const { BpmnBlock, BpmnTask, BpmnConnection, BpmnGateway, BpmnEvent, BpmnBlockOverlayReport, Point } = require("./bpmn-constructs");

const fs = require('fs');

/**
 * Class representing a BPMN model
 */
class BpmnModel {
    /**
     * 
     * @param {String} perspectiveName Name of Process Perspective the BpmnModel instance embodies
     * @param {String} modelXml Valid XML String describing the BPMN model (both process and diagram (visualization))
     */
    constructor(perspectiveName, modelXml) {
        this.model_xml = modelXml
        this.parsed_model_xml = undefined
        this.perspective_name = perspectiveName
        this.lifecycle_stage = 'CREATED' //CREATED-RUNNING-ACTIVE-COMPLETED

        this.constructs = new Map() //Containing all Blocks and Edges of the original Process Diagram
        this.overlay_constructs = new Map() //Contains Bpmn Blocks and Edges which are created to represent deviations, but not part of the original model

        this.parseModelXml()
        this._buildModel()
    }

    /**
     * Parsing the modelXml String provided as constructor argument
     * The result is saved in the this.parsed_model_xml attribute
     */
    parseModelXml() {
        if (this.model_xml == undefined) {
            this.parsed_model_xml = undefined
            return
        }
        var context = this
        xml2js.parseString(this.model_xml, function (err, result) {
            if (err) {
                throw new Error('Error while parsing XML: ' + err)
            }
            context.parsed_model_xml = result
        })
    }

    /**
     * Clear all model-related attributes and rebuild it based on this.parsed_model_xml
     * As a prerequirement parseModelXml() function has to be called before this function
     */
    _buildModel() {
        if (this.parsed_model_xml == undefined) {
            return
        }
        //Creating a temporary map containing all blocks and their position information, to make data retieval efficient
        //The information from this map will be used during block instantiations
        var diagram_elements = new Map()
        var shapes = this.parsed_model_xml['bpmn2:definitions']['bpmndi:BPMNDiagram'][0]['bpmndi:BPMNPlane'][0]['bpmndi:BPMNShape']
        var edges = this.parsed_model_xml['bpmn2:definitions']['bpmndi:BPMNDiagram'][0]['bpmndi:BPMNPlane'][0]['bpmndi:BPMNEdge']
        //Reset model data structures
        this.constructs.clear()
        this.overlay_constructs.clear()
        shapes.forEach(element => {
            var shape = {
                x: element['dc:Bounds'][0]['$'].x,
                y: element['dc:Bounds'][0]['$'].y,
                width: element['dc:Bounds'][0]['$'].width,
                height: element['dc:Bounds'][0]['$'].height
            }
            diagram_elements.set(element['$'].bpmnElement, shape)
        });
        edges.forEach(element => {
            var waypoints = []
            element['di:waypoint'].forEach(point => {
                waypoints.push({ x: point['$'].x, y: point['$'].y })
            });
            diagram_elements.set(element['$'].bpmnElement, waypoints)
        });

        //Creating BPMN construct instances
        var tasks = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:task']
        for (var key in tasks) {
            var newTask = new BpmnTask(tasks[key]['$'].id, tasks[key]['$'].name, tasks[key]['bpmn2:incoming'], tasks[key]['bpmn2:outgoing'],
                diagram_elements.get(tasks[key]['$'].id))
            this.constructs.set(tasks[key]['$'].id, newTask)
        }

        var connections = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:sequenceFlow']
        for (var key in connections) {
            var newConnection = new BpmnConnection(connections[key]['$'].id, connections[key]['$'].name, connections[key]['$'].sourceRef,
                connections[key]['$'].targetRef, diagram_elements.get(connections[key]['$'].id))
            this.constructs.set(connections[key]['$'].id, newConnection)
        }

        var parallelGateways = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:parallelGateway']
        for (var key in parallelGateways) {
            var newGateway = new BpmnGateway(parallelGateways[key]['$'].id, parallelGateways[key]['$'].name, 'PARALLEL',
                parallelGateways[key]['$'].gatewayDirection, parallelGateways[key]['bpmn2:incoming'], parallelGateways[key]['bpmn2:outgoing'],
                diagram_elements.get(parallelGateways[key]['$'].id))
            this.constructs.set(parallelGateways[key]['$'].id, newGateway)
        }

        var exclusiveGateways = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:exclusiveGateway']
        for (var key in exclusiveGateways) {
            var newGateway = new BpmnGateway(exclusiveGateways[key]['$'].id, exclusiveGateways[key]['$'].name, 'EXCLUSIVE',
                exclusiveGateways[key]['$'].gatewayDirection, exclusiveGateways[key]['bpmn2:incoming'], exclusiveGateways[key]['bpmn2:outgoing'],
                diagram_elements.get(exclusiveGateways[key]['$'].id))
            this.constructs.set(exclusiveGateways[key]['$'].id, newGateway)
        }

        var inclusiveGateways = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:inclusiveGateway']
        for (var key in inclusiveGateways) {
            var newGateway = new BpmnGateway(inclusiveGateways[key]['$'].id, inclusiveGateways[key]['$'].name, 'INCLUSIVE',
                inclusiveGateways[key]['$'].gatewayDirection, inclusiveGateways[key]['bpmn2:incoming'], inclusiveGateways[key]['bpmn2:outgoing'],
                diagram_elements.get(inclusiveGateways[key]['$'].id))
            this.constructs.set(inclusiveGateways[key]['$'].id, newGateway)
        }

        var startEvents = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:startEvent']
        for (var key in startEvents) {
            var newEvent = new BpmnEvent(startEvents[key]['$'].id, startEvents[key]['$'].name, 'START', [], startEvents[key]['bpmn2:outgoing'], undefined,
                diagram_elements.get(startEvents[key]['$'].id))
            this.constructs.set(startEvents[key]['$'].id, newEvent)
        }

        var endEvents = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:endEvent']
        for (var key in endEvents) {
            var newEvent = new BpmnEvent(endEvents[key]['$'].id, endEvents[key]['$'].name, 'END', endEvents[key]['bpmn2:incoming'], [], undefined,
                diagram_elements.get(endEvents[key]['$'].id))
            this.constructs.set(endEvents[key]['$'].id, newEvent)
        }

        var boundaryEvents = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:boundaryEvent']
        for (var key in boundaryEvents) {
            var newEvent = new BpmnEvent(boundaryEvents[key]['$'].id, boundaryEvents[key]['$'].name, 'BOUNDARY', [],
                boundaryEvents[key]['bpmn2:outgoing'], boundaryEvents[key]['$'].attachedToRef, diagram_elements.get(boundaryEvents[key]['$'].id))
            this.constructs.set(boundaryEvents[key]['$'].id, newEvent)
        }

        var intermediateThrowEvents = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:intermediateThrowEvent']
        for (var key in intermediateThrowEvents) {
            var newEvent = new BpmnEvent(intermediateThrowEvents[key]['$'].id, intermediateThrowEvents[key]['$'].name, 'INTERMEDIATE_THROW', intermediateThrowEvents[key]['bpmn2:incoming'],
                intermediateThrowEvents[key]['bpmn2:outgoing'], undefined, diagram_elements.get(intermediateThrowEvents[key]['$'].id))
            this.constructs.set(intermediateThrowEvents[key]['$'].id, newEvent)
        }

        var intermediateCatchEvents = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:intermediateCatchEvent']
        for (var key in intermediateCatchEvents) {
            var newEvent = new BpmnEvent(intermediateCatchEvents[key]['$'].id, intermediateCatchEvents[key]['$'].name, 'INTERMEDIATE_CATCH', intermediateCatchEvents[key]['bpmn2:incoming'],
                intermediateCatchEvents[key]['bpmn2:outgoing'], undefined, diagram_elements.get(intermediateCatchEvents[key]['$'].id))
            this.constructs.set(intermediateCatchEvents[key]['$'].id, newEvent)
        }

        //When the model is complete, iterating through the blocks and for each diverging BpmnGateway one find the converging
        this.constructs.forEach(element => {
            if (element.constructor.name == 'BpmnGateway' && element.subtype == 'Diverging') {
                var convergingGateway = this.findConvergingGateway(element)
                if (convergingGateway != element) {
                    element.pair_gateway = convergingGateway.id
                    convergingGateway.pair_gateway = element.id
                }
                else {
                    console.warn('ERROR while trying to find Converging gateway for: ' + element.id)
                }
            }
        });
    }

    /**
     * Sets the lifecycle of the model
     * @param {String} newStage New Lifecycle stage 
     */
    setLifecycle(newStage) {
        this.lifecycle_stage = newStage
    }

    /**
     * Finds the Converging pair of a Diverging gateway
     * @param {BpmnGateway} divergingGateway The Converging gateway whose diverging pair is intended to be found. This attribute must be Diverging! 
     * @returns Returns a BpmnGateway object of the converging pair of 'divergingGateway'
     */
    findConvergingGateway(divergingGateway) {
        //Use BFS to find the matching converging gateway
        const queue = [...divergingGateway.outputs.map(output => this.constructs.get(output))]
        const visited = new Set([divergingGateway.id])
        let nestingLevel = 1
        while (queue.length > 0 && nestingLevel > 0) {
            const current = queue.shift()
            if (!current)
                continue
            const targetId = current.target
            if (!targetId || visited.has(targetId))
                continue
            visited.add(targetId);
            const targetNode = this.constructs.get(targetId)
            if (!targetNode)
                continue
            //Check if this is a gateway
            if (targetNode.constructor.name === 'BpmnGateway') {
                if (targetNode.subtype === 'Diverging') {
                    nestingLevel++
                } else if (targetNode.subtype === 'Converging') {
                    nestingLevel--
                    if (nestingLevel === 0) {
                        return targetNode
                    }
                }
            }
            //Add all outputs to the queue for exploration
            if (targetNode.outputs && targetNode.outputs.length > 0) {
                for (const outputId of targetNode.outputs) {
                    const outputFlow = this.constructs.get(outputId)
                    if (outputFlow && !visited.has(outputFlow.id)) {
                        queue.push(outputFlow)
                    }
                }
            }
        }
        return null
    }

    /**
     * Updates the status and state of a list of BpmnTask-s
     * @param {Object[]} stageInfo Should contain a list of objects: {stage_name; status; state}
     */
    applyEgsmStageArray(stageInfo) {
        stageInfo.forEach(element => {
            if (this.constructs.has(element.name)) {
                this.constructs.get(element.name).update(element.status, element.state)
            }
        });
    }

    /**
     * Applies a devition on the BPMN model
     * @param {Deviation} deviation A deviation Object inherited from Deviation superclass 
     */
    applyDeviation(deviation) {
        switch (deviation.type) {
            //SkipDeviation consists of an OutOfOrder activity and a Skipped Sequence
            //It is represented as an arrow from the last correctly executed activity to the
            //OutOfOrder one
            //TODO: consider the case where last few stages of a sequence are skipped
            case 'SKIPPED':
                var firstSkippedBlock = deviation.block_a[0].endsWith('_iteration')
                    ? deviation.block_a[0].slice(0, -'_iteration'.length)
                    : deviation.block_a[0];
                var lastSkippedBlock = deviation.block_a.at(-1)
                if (this.constructs.has(firstSkippedBlock)) {
                    var block = this.constructs.get(firstSkippedBlock)
                    if (block.constructor.name !== 'BpmnConnection') {
                        block.addDeviation('SKIPPED', { iterationIndex: deviation.iterationIndex, parentIndex: deviation.parentIndex })
                    }
                }
                if (!deviation.block_b || deviation.block_b === 'NONE')
                    break;
                //It means that the first and last blocks which has been skipped exist in the BPMN diagram as well
                if (this.constructs.has(firstSkippedBlock) && this.constructs.has(lastSkippedBlock)) {
                    var inputEdge = this.constructs.get(firstSkippedBlock).inputs?.[0] || 'NONE'
                    var outputEdge = this.constructs.get(lastSkippedBlock).outputs?.[0] || 'NONE'
                    //If a whole block has been skipped we need to use the pair_gateway
                    if (this.constructs.get(lastSkippedBlock).constructor.name == 'BpmnGateway') {
                        if (this.constructs.get(lastSkippedBlock).pair_gateway != 'NA') {
                            outputEdge = this.constructs.get(this.constructs.get(lastSkippedBlock).pair_gateway)?.outputs[0] || 'NONE'
                        }
                    }
                    var source = 'NONE'
                    var destination = 'NONE'
                    if (inputEdge != 'NONE') {
                        source = this.constructs.get(inputEdge).source || 'NONE'
                    }
                    if (outputEdge != 'NONE') {
                        destination = this.constructs.get(outputEdge).target || 'NONE'
                    }
                    //IF any of source or destination is 'NONE', then it requires further consideration, since BPMN specification
                    //requires to provide the source and destination of the edge
                    if (source != 'NONE' && destination != 'NONE') {
                        var waypoints = [this.constructs.get(inputEdge).waypoints[0], new Point(this.constructs.get(inputEdge).waypoints[0].x, 450),
                        new Point(this.constructs.get(outputEdge).waypoints.at(-1).x, 450),
                        this.constructs.get(outputEdge).waypoints.at(-1)]
                        this._addSkippingEdgeToModel(this._getNextSequenceId(), waypoints, source, destination)
                    }
                    //StartEvent has been skipped, we need to add a virtual start event to draw the skipping edge
                    if (source == 'NONE' && destination != 'NONE') {
                        var idShape = UUID.v4()
                        var eventPosition = new Point(80, 450)
                        var eventWidth = 36
                        var eventHeight = 36
                        var waypoints = [new Point(eventPosition.x + eventWidth / 2, eventPosition.y + eventHeight / 2), new Point(eventPosition.x + eventWidth / 2, 450 + eventHeight / 2),
                        new Point(this.constructs.get(outputEdge).waypoints.at(-1).x, 450 + eventHeight / 2),
                        this.constructs.get(outputEdge).waypoints.at(-1)]
                        var edgeId = this._addSkippingEdgeToModel(this._getNextSequenceId(), waypoints, idShape, destination)
                        this._addIllegalEntryToModel(idShape, eventPosition, eventWidth, eventHeight, edgeId)
                    }
                }

                break;
            case 'OVERLAP':
                if (this.constructs.has(deviation.block_b)) {
                    this.constructs.get(deviation.block_b).addDeviation('OVERLAP', { over: deviation.block_a, iterationIndex: deviation.iterationIndex, parentIndex: deviation.parentIndex })
                }
                break;
            //IncompleteDeviation regards always one eGSM stage only. If we are able to find the
            //matching BPMN task or block then we can add a Flag, otherwise neglect it
            //TODO: consider how this works with parallel, inclusive, exclusive, iteration
            case 'INCOMPLETE':
                var constructId = deviation.block_a.endsWith('_iteration')
                    ? deviation.block_a.slice(0, -'_iteration'.length)
                    : deviation.block_a;
                const construct = this.constructs.get(constructId)
                if (construct instanceof BpmnBlock) {
                    console.log('INCOMPLETE: ' + deviation.block_a)
                    console.log('Construct:', JSON.stringify(construct, null, 2))
                    construct.addDeviation('INCOMPLETE', { iterationIndex: deviation.iterationIndex, parentIndex: deviation.parentIndex })
                }
                break;
            //TODO: consider branches
            case 'MULTI_EXECUTION':
                if (this.constructs.has(deviation.block_a)) {
                    console.log('MULTI_EXECUTION: ' + deviation.block_a)
                    console.log('Construct:', JSON.stringify(this.constructs.get(deviation.block_a), null, 2))
                    this.constructs.get(deviation.block_a).addDeviation('MULTI_EXECUTION', { count: deviation.executionCount, iterationIndex: deviation.iterationIndex, parentIndex: deviation.parentIndex })
                }
                break;
            case 'INCORRECT_EXECUTION':
                //TODO: could also add edges based on the sequence, but needs more consideration
                var constructId = deviation.block_a.endsWith('_iteration')
                    ? deviation.block_a.slice(0, -'_iteration'.length)
                    : deviation.block_a;
                if (this.constructs.has(constructId)) {
                    this.constructs.get(constructId).addDeviation('INCORRECT_EXECUTION', { iterationIndex: deviation.iterationIndex, parentIndex: deviation.parentIndex })
                }
                break;
            case 'INCORRECT_BRANCH':
                if (this.constructs.has(deviation.block_a)) {
                    this.constructs.get(deviation.block_a).addDeviation('INCORRECT_BRANCH', { iterationIndex: deviation.iterationIndex, parentIndex: deviation.parentIndex })
                }
                break;
        }
    }

    /**
     * Resets the model to its original state (based on the BPMN XML description provided in the constructor)
     */
    resetModel() {
        this.parseModelXml()
        this._buildModel()
    }

    /**
     * Gets the current XML representation of the model (containing the deviations as well)
     * @returns String containing the XML description of the diagram
     */
    getModelXml() {
        var builder = new xml2js.Builder();
        return builder.buildObject(this.parsed_model_xml);
    }

    /**
     * Adding a new Skipping edge to the Diagram
     * Skipping Edges are special edges (marked by red) representing SkipDeviations (the process flow skipped a segment of the process)
     * @param {String} id Unique ID of the new edge
     * @param {Point[]} waypoints Edge waypoints
     * @param {String} sourceNode ID of the source node 
     * @param {String} targetNode ID of the target node
     * @returns 
     */
    _addSkippingEdgeToModel(id, waypoints, sourceNode, targetNode) {
        var newBpmnSequence = {
            $: {
                id: id,
                sourceRef: sourceNode,
                targetRef: targetNode
            }
        }
        var newBpmnEdge = {
            $: {
                id: 'BPMNEdge_' + id,
                bpmnElement: id,
                sourceElement: 'BPMNShape_' + sourceNode,
                targetElement: 'BPMNShape_' + targetNode
            },
            'di:waypoint': [],
            'bpmndi:BPMNLabel': {
                $: {
                    id: 'BPMNLabel_' + id,
                    labelStyle: 'BPMNLabelStyle_1'
                }
            }
        }
        waypoints.forEach(point => {
            newBpmnEdge['di:waypoint'].push({
                $: {
                    'xsi:type': 'dc:Point',
                    x: point.x,
                    y: point.y
                }
            })
        });
        const process = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]
        process['bpmn2:sequenceFlow'].push(newBpmnSequence)
        this.parsed_model_xml['bpmn2:definitions']['bpmndi:BPMNDiagram'][0]['bpmndi:BPMNPlane'][0]['bpmndi:BPMNEdge'].push(newBpmnEdge)
        this._findElementById(process, sourceNode)['bpmn2:outgoing'].push(id)
        this._findElementById(process, targetNode)['bpmn2:incoming'].push(id)
        this.overlay_constructs.set(id, new BpmnConnection(id, '', sourceNode, targetNode, waypoints))
        this.overlay_constructs.get(id).status = 'HIGHLIGHTED'
        return id
    }

    _findElementById(process, id) {
        for (const [_, elements] of Object.entries(process)) {
            if (!Array.isArray(elements)) continue;
            const found = elements.find(el => el.$?.id === id);
            if (found) return found;
        }
        return null;
    }

    _getNextSequenceId() {
        const sequenceFlows = this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:sequenceFlow'];
        if (!sequenceFlows || sequenceFlows.length === 0) {
            return 'SequenceFlow_1';
        }
        let maxNumber = 0;
        sequenceFlows.forEach(flow => {
            const id = flow.$.id || flow.id;
            if (id && id.startsWith('SequenceFlow_')) {
                const numberPart = id.replace('SequenceFlow_', '');
                const num = parseInt(numberPart, 10);
                if (!isNaN(num) && num > maxNumber) {
                    maxNumber = num;
                }
            }
        });

        return 'SequenceFlow_' + (maxNumber + 1);
    }

    /**
     * Adds a new BpmnEvent to the diagram with a special 'illegal' state
     * The event represents if the original Start event(s) has been skipped and the Process flow has been started with a task/event
     * which is not a valid Start Event
     * The Illegal Entry is always combined with a Skipping Edge and similarly to that it is also marked with Red
     * @param {String} id Unique ID
     * @param {Point} position Position of the Event Block
     * @param {Number} width Widht of the Block
     * @param {Number} height Height of the Block
     * @param {String} outgoingEdge Id of the Outgoing Edge
     * @returns 
     */
    _addIllegalEntryToModel(id, position, width, height, outgoingEdge) {
        var newBpmnStartEvent = {
            $: {
                id: id,
                name: ''
            },
            'bpmn2:outgoing': outgoingEdge
        }
        var newBpmnShape = {
            $: {
                id: 'BPMNEdge_' + id,
                bpmnElement: id
            },
            'dc:Bounds': {
                $: {
                    height: height,
                    width: width,
                    x: position.x,
                    y: position.y
                }
            }
        }
        this.parsed_model_xml['bpmn2:definitions']['bpmn2:process'][0]['bpmn2:startEvent'].push(newBpmnStartEvent)
        this.parsed_model_xml['bpmn2:definitions']['bpmndi:BPMNDiagram'][0]['bpmndi:BPMNPlane'][0]['bpmndi:BPMNShape'].push(newBpmnShape)
        this.overlay_constructs.set(id, new BpmnEvent(id, '', 'START', [], [outgoingEdge], undefined, position))
        this.overlay_constructs.get(id).illegal = true
        return id
    }

    /**
     * Gets an Array of OverlayReport Objects representing the current state of the mode (including deviations as well)
     * @returns List of OverlayReport Objects interpreted by the Front-end
     */
    getOverlay() {
        var result = []
        this.constructs.forEach(element => {
            if (element.constructor.name == 'BpmnTask' || element.constructor.name == 'BpmnEvent' || element.constructor.name == 'BpmnConnection' || element.constructor.name == 'BpmnGateway') {
                var color = element.getBlockColor()
                var flags = element.deviations || []
                result.push(new BpmnBlockOverlayReport(this.perspective_name, element.id, color, flags))
            }
        });
        return result
    }
}

module.exports = {
    BpmnModel
}