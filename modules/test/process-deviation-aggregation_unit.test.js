const { ProcessDeviationAggregation } = require('../monitoring/monitoringtypes/process-deviation-aggregation');
const PRIM = require('../egsm-common/auxiliary/primitives');

jest.mock('../egsm-common/auxiliary/auxiliary');
jest.mock('../egsm-common/auxiliary/logManager');
jest.mock('../communication/mqttcommunication');
jest.mock('../egsm-common/database/databaseconfig');
jest.mock('../egsm-common/database/dynamoconnector');
jest.mock('../egsm-common/database/databaseconnector');

const mockDB = require('../egsm-common/database/databaseconnector');
const fs = require('fs');
const path = require('path');

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

describe('ProcessDeviationAggregation - Unit Tests', () => {
    let instance;
    let mockBroker;
    let mockNotificationManager;
    let mockPerspectives;

    beforeEach(() => {
        mockBroker = new PRIM.Broker('localhost', 1883, '', '');
        mockNotificationManager = new MockNotificationManager();
        mockPerspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C']);
        
        instance = new ProcessDeviationAggregation(
            'agg-1', 
            [mockBroker], 
            'owner', 
            'Process-type-1', 
            mockPerspectives, 
            [], 
            mockNotificationManager
        );

        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with empty process type data', async () => {
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            
            const result = await instance.initialize();

            expect(result).toBe(true);
            expect(instance.processType).toBe('Process-type-1');
            expect(instance.deviationData).toBeDefined();
            expect(instance.stageAggregatedData).toBeDefined();
            expect(instance.perspectiveSummary).toBeDefined();
        });

        test('should handle initialization failure', async () => {
            mockDB.readAllProcessTypeDeviations.mockRejectedValue(new Error('Database error'));
            
            const result = await instance.initialize();
            
            expect(result).toBe(false);
        });
    });

    describe('Stage ID Normalization', () => {
        test('should normalize stage IDs with iteration suffix', () => {
            const normalized1 = instance._normalizeStageId('Stage_A_iteration');
            const normalized2 = instance._normalizeStageId('Stage_A');

            expect(normalized1).toBe('Stage_A');
            expect(normalized2).toBe('Stage_A');
        });

        test('should handle null or undefined stage names', () => {
            expect(instance._normalizeStageId(null)).toBeNull();
            expect(instance._normalizeStageId(undefined)).toBeUndefined();
            expect(instance._normalizeStageId('')).toBe('');
        });
    });

    describe('Instance ID Extraction', () => {
        test('should extract instance ID from engine ID', () => {
            const instanceId1 = instance._extractInstanceId('p3__truck', 'truck');
            const instanceId2 = instance._extractInstanceId('instance-123__carrier', 'carrier');

            expect(instanceId1).toBe('p3');
            expect(instanceId2).toBe('instance-123');
        });
    });

    describe('Deviation Comparison', () => {
        test('should compare deviations correctly', () => {
            const dev1 = [{ type: 'SKIPPED', block_a: 'Stage_A', details: {} }];
            const dev2 = [{ type: 'SKIPPED', block_a: 'Stage_A', details: {} }];
            const dev3 = [{ type: 'OVERLAP', block_a: 'Stage_B', details: {} }];

            expect(instance._deviationsEqual(dev1, dev2)).toBe(true);
            expect(instance._deviationsEqual(dev1, dev3)).toBe(false);
            expect(instance._deviationsEqual(null, null)).toBe(true);
            expect(instance._deviationsEqual(null, dev1)).toBe(false);
        });
    });

    describe('Block ID Extraction', () => {
        test('should get relevant block IDs for different deviation types', () => {
            const skipSingle = { type: 'SKIPPED', block_a: 'Stage_A' };
            const skipMultiple = { type: 'SKIPPED', block_a: ['Stage_A', 'Stage_B'] };
            const overlap = { type: 'OVERLAP', block_a: 'Stage_A', block_b: 'Stage_B' };

            expect(instance._getRelevantBlockIds(skipSingle)).toEqual(['Stage_A']);
            expect(instance._getRelevantBlockIds(skipMultiple)).toEqual(['Stage_A', 'Stage_B']);
            expect(instance._getRelevantBlockIds(overlap)).toEqual(['Stage_B']);
        });
    });

    describe('Data Retrieval Methods', () => {
        test('should return complete aggregation data structure', async () => {
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            await instance.initialize();

            const data = instance.getCompleteAggregationData();

            expect(data.job_id).toBe('agg-1');
            expect(data.job_type).toBe('process-deviation-aggregation');
            expect(data.process_type).toBe('Process-type-1');
            expect(data.perspectives).toBeDefined();
            expect(data.summary).toBeDefined();
        });

        test('should return aggregated summary', async () => {
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            await instance.initialize();

            const summary = instance.getAggregatedSummary();

            expect(summary.perspectives).toBeDefined();
            expect(summary.overall).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle deviations with unknown perspective', async () => {
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            await instance.initialize();

            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            
            const messageObj = {
                process_id: 'p1',
                process_perspective: 'unknown_perspective',
                deviations: createMockDeviations('SKIPPED', 'Stage_A')
            };
            
            await instance.handleDeviations(messageObj);
            
            expect(consoleSpy).toHaveBeenCalledWith('Received deviations for unknown perspective: unknown_perspective');
            consoleSpy.mockRestore();
        });

        test('should handle new instance without initialization', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            await instance.handleNewInstance('p1');
            
            consoleSpy.mockRestore();
        });
    });

    describe('Error Handling - Extended', () => {
        test('should handle handleDeviations errors', async () => {
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            await instance.initialize();
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            jest.spyOn(instance, '_updateInMemoryStructures').mockRejectedValue(new Error('Update failed'));
            
            const messageObj = {
                process_id: 'p1',
                process_perspective: 'truck',
                deviations: createMockDeviations('SKIPPED', 'Stage_A')
            };
            
            await instance.handleDeviations(messageObj);
            
            expect(consoleSpy).toHaveBeenCalledWith('Failed to handle deviations: Update failed');
            consoleSpy.mockRestore();
        });

        test('should handle handleNewInstance initialization errors', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            mockDB.readAllProcessTypeDeviations.mockRejectedValue(new Error('DB error'));
            
            await instance.handleNewInstance('p1');
            
            expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize ProcessDeviationAggregation job: DB error');
            consoleSpy.mockRestore();
        });

        test('should handle handleNewInstance processing errors', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            
            instance.isInitialized = true;
            
            jest.spyOn(instance, '_buildAggregatedStructuresWithCount').mockImplementation(() => {
                throw new Error('Failed to build aggregated structures');
            });
            
            await instance.handleNewInstance('p1');
            
            expect(consoleSpy).toHaveBeenCalledWith('Failed to handle new instance: Failed to build aggregated structures');
            consoleSpy.mockRestore();
        });
    });

    describe('Event Triggering', () => {
        test('should trigger complete update event', async () => {
            mockDB.readAllProcessTypeDeviations.mockResolvedValue({});
            mockDB.readAllProcessInstances.mockResolvedValue([]);
            await instance.initialize();
            
            const mockEmit = jest.fn();
            instance.eventEmitter = { emit: mockEmit };
            
            instance.triggerCompleteUpdateEvent();
            
            expect(mockEmit).toHaveBeenCalledWith('job-update', expect.any(Object));
        });
    });
});