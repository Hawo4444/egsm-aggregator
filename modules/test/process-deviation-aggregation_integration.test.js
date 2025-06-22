const AUX = require('../egsm-common/auxiliary/auxiliary');
const LOG = require('../egsm-common/auxiliary/logManager');
const MQTTCOMM = require('../communication/mqttcommunication');
const DBCONFIG = require('../egsm-common/database/databaseconfig');
const PRIM = require('../egsm-common/auxiliary/primitives');
const DYNAMO = require('../egsm-common/database/dynamoconnector');
const DB = require('../egsm-common/database/databaseconnector');
const { ProcessDeviationAggregation } = require('../monitoring/monitoringtypes/process-deviation-aggregation');
const fs = require('fs');
const path = require('path');

async function initTables() {
    const promises = [
        DYNAMO.initTable('PROCESS_TYPE', 'PROCESS_TYPE_NAME', undefined),
        DYNAMO.initTable('PROCESS_INSTANCE', 'PROCESS_TYPE_NAME', 'INSTANCE_ID'),
        DYNAMO.initTable('PROCESS_GROUP_DEFINITION', 'NAME', undefined),
        DYNAMO.initTable('STAKEHOLDERS', 'STAKEHOLDER_ID', undefined),
        DYNAMO.initTable('PROCESS_DEVIATIONS', 'PROCESS_TYPE_PERSPECTIVE', 'INSTANCE_ID'),
        DYNAMO.initTable('ARTIFACT_DEFINITION', 'ARTIFACT_TYPE', 'ARTIFACT_ID'),
        DYNAMO.initTable('ARTIFACT_USAGE', 'ARTIFACT_NAME', 'CASE_ID'),
        DYNAMO.initTable('ARTIFACT_EVENT', 'ARTIFACT_NAME', 'EVENT_ID', { 
            indexname: 'PROCESSED_INDEX', 
            pk: { name: 'ENTRY_PROCESSED', type: 'N' } 
        }),
        DYNAMO.initTable('STAGE_EVENT', 'PROCESS_NAME', 'EVENT_ID')
    ];
    await Promise.all(promises);
}

async function deleteTables() {
    const TABLES = [
        'PROCESS_TYPE', 'PROCESS_INSTANCE', 'PROCESS_GROUP_DEFINITION', 'STAKEHOLDERS',
        'PROCESS_DEVIATIONS', 'ARTIFACT_EVENT', 'ARTIFACT_USAGE', 'ARTIFACT_DEFINITION', 'STAGE_EVENT'
    ];
    const promises = TABLES.map(table => DYNAMO.deleteTable(table));
    await Promise.all(promises);
}

function loadBpmnFile(filename) {
    const bpmnPath = path.join(__dirname, 'fixtures', filename);
    return fs.readFileSync(bpmnPath, 'utf8');
}

function createMockPerspectiveData(perspectiveName, stages) {
    return new Map([
        [perspectiveName, {
            name: perspectiveName,
            egsm_stages: stages,
            bpmn_diagram: loadBpmnFile('bpmn_truck.bpmn')
        }]
    ]);
}

function createMockDeviations(type, stageA, stageB = null, details = {}) {
    return [{
        type: type,
        block_a: stageA,
        block_b: stageB,
        details: details,
        timestamp: Math.floor(Date.now() / 1000)
    }];
}

class MockNotificationManager {
    constructor() {
        this.notification = undefined;
        this.notification_rules = undefined;
    }
    notifyEntities(notification, notificationrules) {
        this.notification = notification;
        this.notification_rules = notificationrules;
    }
    reset() {
        this.notification = undefined;
        this.notification_rules = undefined;
    }
}

describe('ProcessDeviationAggregation - Integration Tests', () => {
    let broker;
    let mockNotificationManager;

    beforeAll(() => {
        DYNAMO.initDynamo('fakeMyKeyId', 'fakeSecretAccessKey', 'local', 'http://localhost:8000');
        LOG.setLogLevel(5);
        broker = new PRIM.Broker('localhost', 1883, '', '');
    });

    beforeEach(async () => {
        await initTables();
        DBCONFIG.initDatabaseConnection('localhost', '8000', 'local', 'fakeMyKeyId', 'fakeSecretAccessKey');
        MQTTCOMM.initPrimaryBrokerConnection(broker);
        mockNotificationManager = new MockNotificationManager();
        
        await DYNAMO.writeItem('PROCESS_TYPE', 
            { name: 'PROCESS_TYPE_NAME', value: 'Process-type-1' }, 
            undefined, 
            [
                { name: 'PROCESS_INFO', type: 'S', value: JSON.stringify({ name: 'Process-type-1', description: 'Test process' }) },
                { name: 'INSTANCE_COUNTER', type: 'N', value: '0' },
                { name: 'BPMN_JOB_COUNTER', type: 'N', value: '0' },
                { name: 'PROCESS_STATISTICS', type: 'S', value: '{}' }
            ]
        );
    });

    afterEach(async () => {
        await deleteTables();
    });

    describe('End-to-End Process Deviation Workflows', () => {
        test('should handle complete workflow from empty state to aggregated results', async () => {
            const perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C']);
            const instance = new ProcessDeviationAggregation(
                'agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], mockNotificationManager
            );

            let result = await instance.initialize();
            expect(result).toBe(true);

            await instance.handleNewInstance('p1');
            
            const messageObj = {
                process_id: 'p1',
                process_perspective: 'truck',
                deviations: createMockDeviations('SKIPPED', 'Stage_A')
            };
            await instance.handleDeviations(messageObj);

            const summary = instance.getAggregatedSummary();
            expect(summary.perspectives).toHaveLength(1);
            expect(summary.perspectives[0].totalInstances).toBe(1);
            expect(summary.perspectives[0].instancesWithDeviations).toBe(1);
        });

        test('should handle multiple perspectives with cross-perspective analysis', async () => {
            const perspectives = new Map([
                ['truck', {
                    name: 'truck',
                    egsm_stages: ['Stage_A', 'Stage_B'],
                    bpmn_diagram: loadBpmnFile('bpmn_truck.bpmn')
                }],
                ['carrier', {
                    name: 'carrier',
                    egsm_stages: ['Stage_X', 'Stage_Y'],
                    bpmn_diagram: loadBpmnFile('bpmn_truck.bpmn')
                }]
            ]);

            const instance = new ProcessDeviationAggregation(
                'agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], mockNotificationManager
            );

            await instance.initialize();
            await instance.handleNewInstance('p1');
            await instance.handleNewInstance('p2');

            const truckDeviations = {
                process_id: 'p1__truck',
                process_perspective: 'truck',
                deviations: createMockDeviations('SKIPPED', 'Stage_A')
            };
            
            const carrierDeviations = {
                process_id: 'p1__carrier',
                process_perspective: 'carrier',
                deviations: createMockDeviations('OVERLAP', 'Stage_X', 'Stage_Y')
            };

            await instance.handleDeviations(truckDeviations);
            await instance.handleDeviations(carrierDeviations);

            const summary = instance.getAggregatedSummary();
            expect(summary.perspectives).toHaveLength(2);
            
            const truckSummary = summary.perspectives.find(p => p.perspective === 'truck');
            const carrierSummary = summary.perspectives.find(p => p.perspective === 'carrier');
            
            expect(truckSummary.instancesWithDeviations).toBe(1);
            expect(carrierSummary.instancesWithDeviations).toBe(1);
        });

        test('should handle complex real-world scenario with multiple instances and deviation types', async () => {
            const perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C']);
            const instance = new ProcessDeviationAggregation(
                'agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], mockNotificationManager
            );

            await instance.initialize();

            const instanceIds = ['p1', 'p2', 'p3', 'p4'];
            for (const id of instanceIds) {
                await instance.handleNewInstance(id);
            }

            const deviationScenarios = [
                {
                    process_id: 'p1',
                    process_perspective: 'truck',
                    deviations: [
                        { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() },
                        { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() + 1000 }
                    ]
                },
                {
                    process_id: 'p2',
                    process_perspective: 'truck',
                    deviations: [
                        { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() },
                        { type: 'SKIPPED', block_a: 'Stage_B', timestamp: Date.now() + 2000 }
                    ]
                },
                {
                    process_id: 'p3',
                    process_perspective: 'truck',
                    deviations: [
                        { type: 'OVERLAP', block_a: 'Stage_A', block_b: 'Stage_B', timestamp: Date.now() + 3000 }
                    ]
                }
            ];

            for (const scenario of deviationScenarios) {
                await instance.handleDeviations(scenario);
            }

            const perspectiveSummary = instance.perspectiveSummary.get('truck');
            expect(perspectiveSummary.totalInstances).toBe(4);
            expect(perspectiveSummary.instancesWithDeviations).toBe(3);
            expect(perspectiveSummary.instancesWithoutDeviations).toBe(1);
            expect(perspectiveSummary.totalDeviations).toBe(5);
            expect(perspectiveSummary.overallDeviationRate).toBe(75);

            const stageAggregatedData = instance.stageAggregatedData.get('truck');
            const stageA = stageAggregatedData.get('Stage_A');
            expect(stageA.instancesWithDeviations.size).toBe(2);
            expect(stageA.deviationRate).toBe(50);
            expect(stageA.counts.get('SKIPPED')).toBe(3);

            const processAggregations = instance.getProcessAggregations('truck');
            expect(processAggregations.truck.stageCorrelations).toBeDefined();
            expect(processAggregations.truck.deviationTypeCounts).toBeDefined();
        });

        test('should filter SequenceFlow elements correctly', async () => {
            const perspectives = createMockPerspectiveData('truck', ['Stage_A', 'SequenceFlow_123', 'Stage_B']);
            const instance = new ProcessDeviationAggregation(
                'agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], mockNotificationManager
            );

            await instance.initialize();
            await instance.handleNewInstance('p1');

            const messageObj = {
                process_id: 'p1__truck',
                process_perspective: 'truck',
                deviations: [
                    { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() },
                    { type: 'SKIPPED', block_a: 'SequenceFlow_123', timestamp: Date.now() + 1000 }
                ]
            };

            await instance.handleDeviations(messageObj);

            const stageAggregatedData = instance.stageAggregatedData.get('truck');
            expect(stageAggregatedData.has('Stage_A')).toBe(true);
            expect(stageAggregatedData.has('Stage_B')).toBe(true);
            expect(stageAggregatedData.has('SequenceFlow_123')).toBe(false);

            const stageAData = stageAggregatedData.get('Stage_A');
            expect(stageAData.deviations).toHaveLength(1);
        });
    });

    describe('MQTT Communication Integration', () => {
        test('should handle MQTT message processing in real-time', async () => {
            const perspectives = createMockPerspectiveData('truck', ['Stage_A']);
            const instance = new ProcessDeviationAggregation(
                'agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], mockNotificationManager
            );

            await instance.initialize();
            
            const messageObj = {
                process_id: 'p1__truck',
                process_perspective: 'truck',
                deviations: createMockDeviations('SKIPPED', 'Stage_A'),
                correlationId: 'test-correlation-id'
            };

            await instance.handleDeviations(messageObj);

            const summary = instance.perspectiveSummary.get('truck');
            expect(summary.instancesWithDeviations).toBe(1);
        });
    });
});