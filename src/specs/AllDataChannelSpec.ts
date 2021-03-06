import _ = require('lodash');
import { NedbDatabaseDataChannel } from '../dataChannels/NedbDatabaseDataChannel';
import { MemoryDataChannel } from '../dataChannels/MemoryDataChannel';
import { Constants } from '../interfaces/Constants';

function testDatabase(create: () => IDataChannel) {
    describe('CRUD set and get updates', () => {
        it('should add new records', (done) => {
            var db = create();
            var record = {
                id: 'id1',
                field: 'field',
                version: 0
            };
            db.create(record, (error: Error, record?: IRecord) => {
                expect(error).toBeFalsy();
                db.getIds(null, null, (error: Error, ids: string[]) => {
                    expect(error).toBeFalsy();
                    expect(record.id).toBeDefined();
                    expect(record['_id']).not.toBeDefined();
                    expect(record.version).toBeGreaterThan(0);
                    expect(ids).toEqual(['id1']);
                    done();
                });
            });
        });

        it('should update existing record', (done) => {
            var db = create();
            var record = {
                id: 'id1',
                field: 'field',
                version: 0
            };
            var recordVersion = record.version;
            db.getVersion((error: Error, version?: string) => {
                db.create(record, (error: Error, record?: IRecord) => {
                    expect(error).toBeFalsy();
                    expect(record.version).toBeGreaterThan(recordVersion);
                    recordVersion = record.version;
                    record['field'] = 'field2';
                    db.update(record, (error: Error, record?: IRecord) => {
                        expect(error).toBeFalsy();
                        expect(record.version).toBeGreaterThan(recordVersion);
                        expect(record['_id']).not.toBeDefined();
                        expect(record['field']).toBe('field2');
                        db.getIds(null, null, (error: Error, ids: string[]) => {
                            expect(error).toBeFalsy();
                            expect(record.id).toBeDefined();
                            expect(record['_id']).not.toBeDefined();
                            expect(ids).toEqual(['id1']);
                            db.getUpdates(version, null, null, (error: Error, updates?: IUpdate[]) => {
                                expect(error).toBeFalsy();
                                expect(updates.length).toBe(2);
                                expect(updates[0].id).toBe('id1');
                                expect(updates[1].id).toBe('id1');
                                expect(updates[0].type).toBe(Constants.UPDATE_CREATED);
                                expect(updates[1].type).toBe(Constants.UPDATE_CHANGED);
                                expect(updates[0].version).toBeDefined();
                                expect(updates[1].version).toBeDefined();
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('should read created record', (done) => {
            var db = create();
            var newRecord: any = <any> {
                field: 'field'
            };
            db.create(<IRecord> newRecord, (error: Error, record: IRecord) => {
                expect(error).toBeFalsy();
                var id = record.id;
                db.read(id, (error: Error, record: IRecord) => {
                    expect(error).toBeFalsy();
                    expect(record['field']).toBe(newRecord.field);
                    done();
                });
            });
        });

        it('should delete existing record and handle subscriptions', (done) => {
            var db = create();
            var newRecord: any = <any> {
                field: 'field'
            };
            db.create(<IRecord> newRecord, (error: Error, record: IRecord) => {
                expect(error).toBeFalsy();
                var id = record.id;
                db.remove(id, (error: Error) => {
                    expect(error).toBeFalsy();
                    db.getUpdates(null, null, null, (error: Error, updates?: IUpdate[]) => {
                        expect(error).toBeFalsy();
                        expect(updates.length).toBe(2);
                        expect(updates[0].id).toBe(id);
                        expect(updates[1].id).toBe(id);
                        expect(updates[0].type).toBe(Constants.UPDATE_CREATED);
                        expect(updates[1].type).toBe(Constants.UPDATE_DELETED);
                        expect(updates[0].version).toBeDefined();
                        expect(updates[1].version).toBeGreaterThan(updates[0].version);
                        done();
                    });
                });
            });
        });

        it('should read many records', (done) => {
            var db = create();
            var newRecord1: any = <any> {
                field: 'value1',
                id: 'id1'
            };
            var newRecord2: any = <any> {
                field: 'value2',
                id: 'id2'
            };
            db.create(newRecord1, (error: Error) => {
                expect(error).toBeFalsy();
                db.create(newRecord2, (error: Error) => {
                    expect(error).toBeFalsy();
                    db.readMany([
                        newRecord1.id,
                        newRecord2.id
                    ], (error: Error, records: IRecord[]) => {
                        expect(error).toBeFalsy();
                        expect(records.length).toBe(2);
                        expect(_.find(records, { id: newRecord1.id })).toBeTruthy();
                        expect(_.find(records, { id: newRecord2.id })).toBeTruthy();
                        done();
                    });
                })
            })
        });

        it('should create many records', (done) => {
            var db = create();
            var newRecord1: any = <any> {
                field: 'value1',
                id: 'id1'
            };
            var newRecord2: any = <any> {
                field: 'value2',
                id: 'id2'
            };
            db.createMany([newRecord1, newRecord2], (error: Error) => {
                expect(error).toBeFalsy();
                db.readMany(['id1', 'id2'], (error: Error, records: IRecord[]) => {
                    expect(error).toBeFalsy();
                    expect(_.includes(records, { id: 'id1'}));
                    expect(_.includes(records, { id: 'id2'}));
                    done();
                });
            });
        });
    });

    it('should return id:version pairs based on query configuration', (done) => {
        var db = create();
        var newRecord: any = <any> {
            field: 'field'
        };
        db.create(<IRecord> newRecord, (error: Error, record: IRecord) => {
            expect(error).toBeFalsy();
            var id = record.id;
            var version = record.version;

            db.getIds(null, null, (error: Error, ids: string[]) => {
                expect(error).toBeFalsy();
                expect(ids).toEqual([id]);
                db.getIds(null, {
                    getVersion: true
                }, (error: Error, ids: string[]) => {
                    expect(error).toBeFalsy();
                    expect(ids).toEqual([id + ':' + version]);
                    done();
                });
            });
        });
    });

    describe('Filtered Queries', () => {
        var record1: any = {
            id: 'id1',
            field: 'abc'
        };
        var record2: any = {
            id: 'id2',
            field: 'def'
        };

        it('should handle regular expression filtering like { a: "b" }', (done) => {

            var db = create();

            db.create(record1, (error: Error) => {
                expect(error).toBeFalsy();
                db.create(record2, (error: Error) => {
                    expect(error).toBeFalsy();

                    var filter = {
                        field: 'a.c'
                    };

                    db.getIds(filter, null, (error: Error, ids: string[]) => {
                        expect(error).toBeFalsy();
                        expect(ids).toEqual([record1.id]);

                        db.getUpdates(null, filter, null, (error: Error, updates: IUpdate[]) => {
                            expect(error).toBeFalsy();
                            expect(updates.length).toBe(1);
                            if (updates.length != 1) {
                                done();
                            } else {
                                expect(updates[0].id).toBe(record1.id);
                                expect(updates[0].type).toBe(Constants.UPDATE_CREATED);
                                db.getVersion((error: Error, version: string) => {
                                    expect(error).toBeFalsy();
                                    expect(updates[0].version).toBeLessThan(version);
                                    done();
                                });
                            }
                        });
                    });
                });
            });
        });
    });

    describe('Limited Queries', () => {
        it('should return only specified count of records', (done) => {
            var record1: any = {
                id: 'id1',
                field: 'abc'
            };
            var record2: any = {
                id: 'id2',
                field: 'def'
            };

            var db = create();

            db.create(record1, (error: Error) => {
                expect(error).toBeFalsy();
                db.create(record2, (error:Error) => {
                    expect(error).toBeFalsy();

                    db.getIds(null, null, (error: Error, ids: string[]) => {
                        expect(error).toBeFalsy();
                        expect(ids.length).toBe(2);

                        db.getUpdates(null, null, null, (error: Error, updates: IUpdate[]) => {
                            expect(error).toBeFalsy();
                            expect(updates.length).toBe(2);

                            var options: IQueryOptions = {
                                from: 0,
                                count: 1,
                                order: {
                                    field: 1
                                }
                            };

                            db.getIds(null, options, (error: Error, ids: string[]) => {
                                expect(error).toBeFalsy();
                                expect(ids).toEqual([record1.id]);

                                db.getUpdates(null, null, options, (error: Error, updates: IUpdate[]) => {
                                    expect(error).toBeFalsy();
                                    expect(updates.length).toBe(1);
                                    expect(updates[0].id).toBe(record1.id);

                                    options.order.field = -1;

                                    db.getIds(null, options, (error: Error, ids: string[]) => {
                                        expect(error).toBeFalsy();
                                        expect(ids).toEqual([record2.id]);

                                        db.getUpdates(null, null, options, (error: Error, updates: IUpdate[]) => {
                                            expect(error).toBeFalsy();
                                            expect(updates.length).toBe(1);
                                            expect(updates[0].id).toBe(record2.id);
                                            done();
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

describe('NeDB Database Data Channel', () => {
    testDatabase((): IDataChannel => {
        return new NedbDatabaseDataChannel();
    });
});

describe('Memory Data Channel', () => {
    testDatabase((): IDataChannel => {
        return new MemoryDataChannel();
    });
});
