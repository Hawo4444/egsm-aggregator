const BLOCK_COLOR_UNOPENED = '#C0C0C0' //Grey
const BLOCK_COLOR_OPENED = '#FFB25F' //Orangish
const BLOCK_COLOR_CLOSED = '#64E358' //Green
const BLOCK_COLOR_ILLEGAL = '#EF233C' //Redish

const CONNECTION_COLOR_REGULAR = '#000000' //Black
const CONNECTION_COLOR_FAULTY = '#EF233C' //Redish
const CONNECTION_COLOR_HIGHLIGHTED = '#F7B801' //Orangish

/**
 * Superclass of any block (Task, Gateway, Event) represented on BPMN diagrams 
 */
class BpmnBlock {
    /**
     * 
     * @param {String} id Unique ID
     * @param {String} name Optional name (use '' if not used)
     * @param {String[]} inputs ID-s of incoming edges
     * @param {String[]} outputs ID-s of outgoing edges
     * @param {Number} positionX X coordinate of the block on the diagram
     * @param {Number} positionY Y coordinate of the block on the diagram
     * @param {Number} width Width of the block on the diagram
     * @param {Number} height Height of the block on the diagram
     */
    constructor(id, name, inputs, outputs, positionX, positionY, width, height) {
        this.id = id
        this.name = name
        this.inputs = inputs || []
        this.outputs = outputs || []
        this.deviations = []
        this.position = new Point(positionX, positionY)
        this.width = width
        this.height = height
    }

    /**
     * Adding a new deviation to the Block
     * @param {Object} deviation 
     * @param {Object} [details] - Additional data related to the deviation (optional)
     */
    addDeviation(deviation, details) {
        this.deviations.push({ deviation, details });
    }

    /**
     * Removes all deviations from the Block
     */
    clearDeviations() {
        this.deviations.clear()
    }

    /**
     * Returns by the color of the block which is determined by certain block attributes
     * Implemented as a placeholder in this Superclass, thus it should be overwritten in inherited classes if it is being used
     */
    getBlockColor() {
        console.warn('This function is not applicable for ' + this.id + ' The function should be overwritten')
    }

    /**
    * Updates the status and state of the Task
    * @param {String} status New status of the Task. Use undefined if not intended to update 
    * @param {String} state New state of the Task. Use undefined if not intended to update
    */
    update(status, state) {
        if (status) {
            this.status = status
        }
        if (state) {
            this.state = state
        }
    }
}

/**
 * Class representing Tasks on BPMN diagrams
 */
class BpmnTask extends BpmnBlock {
    /**
     * @param {String} id Unique ID of the Task
     * @param {String} name Optional name (use '' if not used)
     * @param {String[]} inputs ID-s of incoming edges
     * @param {String[]} outputs ID-s of outgoing edges
     * @param {Point} position Position of the block on the diagram
     */
    constructor(id, name, inputs, outputs, position) {
        super(id, name, inputs, outputs, position.x, position.y, position.width, position.height)
        this.status = 'REGULAR' //REGULAR-FAULTY
        this.state = 'UNOPENED' //UNOPENED-ENABLED-RUNNING-COMPLETED-SKIPPED
    }

    /**
     * Returns the color of the block based on its current state
     * @returns Object containing the color 'stroke' and and 'fill' attributes 
     */
    getBlockColor() {
        switch (this.state) {
            case 'UNOPENED':
                return { stroke: '#000000', fill: BLOCK_COLOR_UNOPENED }
            case 'OPEN':
                return { stroke: '#000000', fill: BLOCK_COLOR_OPENED }
            case 'CLOSED':
                return { stroke: '#000000', fill: BLOCK_COLOR_CLOSED }
        }
    }
}

/**
 * Class representing Gateway on BPMN diagram
 */
class BpmnGateway extends BpmnBlock {
    /**
     * @param {String} id Unique ID of the Gateway
     * @param {String} name Optional name (use '' if not used)
     * @param {String} type Type of the Gateway (PARALLEL/INCLUSIVE etc)
     * @param {String} subtype Subtype of the Gateway (Diverging/Converging)
     * @param {String[]} inputs ID-s of incoming edges
     * @param {String[]} outputs ID-s of outgoing edges
     * @param {Point} position Position of the block on the diagram
     */
    constructor(id, name, type, subtype, inputs, outputs, position) {
        console.log(id)
        super(id, name, inputs, outputs, position.x, position.y, position.width, position.height)
        this.type = type
        this.subtype = subtype
        this.pair_gateway = 'NA'
    }
}

/**
 * Class representing one Event on the BPMN diagarm
 */
class BpmnEvent extends BpmnBlock {
    /**
     * @param {String} id Unique ID of the Event
     * @param {String} name Optional name (use '' if not used)
     * @param {String} type Type of the Event (START/END etc)
     * @param {String[]} inputs ID-s of incoming edges
     * @param {String[]} outputs ID-s of outgoing edges
     * @param {Point} position Position of the block on the diagram
     */
    constructor(id, name, type, inputs, outputs, assigned, position) {
        super(id, name, inputs, outputs, position.x, position.y, position.width, position.height)
        this.type = type
        this.assigned = assigned
        this.state = 'UNOPENED'
        this.illegal = false
    }

    /**
     * Returns the color of the block based on its current state
     * @returns Object containing the color 'stroke' and and 'fill' attributes 
     */
    getBlockColor() {
        if (!this.illegal) {
            switch (this.state) {
                case 'UNOPENED':
                    return { stroke: '#000000', fill: BLOCK_COLOR_UNOPENED }
                case 'OPEN':
                    return { stroke: '#000000', fill: BLOCK_COLOR_OPENED }
                case 'CLOSED':
                    return { stroke: '#000000', fill: BLOCK_COLOR_CLOSED }
            }
        }
        else {
            return { stroke: '#000000', fill: BLOCK_COLOR_ILLEGAL }
        }
    }
}

/**
 * Class representing an Edge on the BPMN diagram
 */
class BpmnConnection {
    /**
     * 
     * @param {String} id Unique ID of the Edge
     * @param {String} name Optional name (use '' if not used)
     * @param {String} source ID of the block the Edge coming from
     * @param {String} target ID of the black the Edge heading to
     * @param {Point[]} waypoints List of Points specifying the route of the Edge
     */
    constructor(id, name, source, target, waypoints) {
        this.id = id
        this.name = name
        this.source = source
        this.target = target
        this.waypoints = waypoints
        this.status = 'REGULAR' //Status of Connections can be: REGULAR-FAULTY-HIGHLIGHTED
    }

    /**
     * Returns the color of the edge based on its current state
     * @returns Object containing the color 'stroke' and and 'fill' attributes 
     */
    getBlockColor() {
        switch (this.status) {
            case 'REGULAR':
                return { stroke: CONNECTION_COLOR_REGULAR, fill: CONNECTION_COLOR_REGULAR }
            case 'FAULTY':
                return { stroke: CONNECTION_COLOR_FAULTY, fill: CONNECTION_COLOR_FAULTY }
            case 'HIGHLIGHTED':
                return { stroke: CONNECTION_COLOR_HIGHLIGHTED, fill: CONNECTION_COLOR_HIGHLIGHTED }

        }
    }
}

/**
 * Wrapper class representing a Point in the 2D space
 */
class Point {
    /**
     * @param {Number} x 
     * @param {Number} y 
     */
    constructor(x, y) {
        this.x = x
        this.y = y
    }
}

/**
 * Class containing specifications about the appearance of a BPMN block
 * Its content is evaluated by the Front-end
 */
class BpmnBlockOverlayReport {
    constructor(perspective, blockId, color, flags) {
        this.perspective = perspective
        this.block_id = blockId
        this.color = color
        this.flags = flags
    }
}

module.exports = {
    BpmnBlock,
    BpmnTask,
    BpmnGateway,
    BpmnEvent,
    BpmnConnection,
    BpmnBlockOverlayReport,
    Point,
}