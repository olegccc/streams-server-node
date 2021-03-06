///<reference path='../interfaces/IDataChannel.ts'/>

import _ = require('lodash');
import { Constants } from '../interfaces/Constants';

export class MemoryDataChannel implements IDataChannel {

    private records: IRecord[];
    private recordMap: { [key: string] : IRecord };
    private updates: IUpdate[];
    private versionId: number = 0;

    constructor(records?: IRecord[]) {
        this.records = records || [];
        this.updates = [];
        this.recordMap = {};
        _.each(this.records, (record: IRecord) => {
            this.recordMap[record.id] = record;
        });
    }

    private getVersionId(): number {
        return (Date.now()*1000) + ((this.versionId++) % 1000);
    }

    read(id: string, callback: (error: Error, record?: IRecord) => void): void {
        callback(null, this.recordMap[id]);
    }

    readMany(ids: string[], callback: (error: Error, records?: IRecord[]) => void): void {
        var records: IRecord[];
        if (!ids) {
            records = this.records;
        } else {
            records = _.filter(this.records, (record: IRecord) => _.contains(ids, record.id));
        }
        callback(null, records);
    }

    update(record: IRecord, callback: (error: Error, record?: IRecord) => void): void {
        var toMerge = _.find(this.records, { id: record.id });

        if (!toMerge) {
            callback(new Error('Cannot find record'), null);
            return;
        }

        _.merge(toMerge, record);
        toMerge.version = this.getVersionId();
        this.onChange(Constants.UPDATE_CHANGED, record.id);

        callback(null, toMerge);
    }

    createMany(records: IRecord[], callback: (error: Error, records?: IRecord[]) => void) : void {
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            this.createUniqueId(record);
            if (this.recordMap.hasOwnProperty(record.id)) {
                _.each(records, (record: IRecord) => {
                    if (record.hasOwnProperty('id') && this.recordMap.hasOwnProperty(record.id)) {
                        delete this.recordMap[record.id];
                    }
                });
                callback(new Error("Record already exists"), null);
                return;
            }
            this.recordMap[record.id] = record;
            record.version = this.getVersionId();
        }

        _.each(records, (record: IRecord) => {
            this.records.push(record);
            this.onChange(Constants.UPDATE_CREATED, record.id);
        });

        callback(null, records);
    }

    private createUniqueId(record: IRecord) {
        if (!record.hasOwnProperty('id')) {
            for (;;) {
                var id = (Date.now() + Math.random()*1000).toString();
                if (!this.recordMap.hasOwnProperty(id)) {
                    record.id = id;
                    break;
                }
            }
        }
    }

    create(record: IRecord, callback: (error: Error, record: IRecord) => void): void {
        this.createUniqueId(record);
        if (this.recordMap.hasOwnProperty(record.id)) {
            callback(new Error("Record already exists"), null);
            return;
        }
        record.version = this.getVersionId();
        this.records.push(record);
        this.recordMap[record.id] = record;
        this.onChange(Constants.UPDATE_CREATED, record.id);
        callback(null, record);
    }

    private static filterField(field: any, test: any) {
        if (_.isString(test)) {
            if (!_.isString(field)) {
                return false;
            }
            var expression = new RegExp(test);
            if (!expression.test(field)) {
                return false;
            }
        } else if (_.isNumber(test)) {
            if (!_.isNumber(field)) {
                return false;
            }
            if (test !== field) {
                return false;
            }
        } else {
            return false;
        }
        return true;
    }

    private static filterRecord(record: IRecord, filter?: any): boolean {
        if (!filter) {
            return true;
        }
        if (_.isObject(filter)) {
            for (var key in filter) {
                if (!filter.hasOwnProperty(key)) {
                    continue;
                }
                var test = filter[key];
                var field = record[key];
                if (!MemoryDataChannel.filterField(field, test)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    getIds(filter: any, options: IQueryOptions, callback: (error: Error, ids?: string[]) => void): void {
        var records = [];
        this.records.forEach((record: IRecord) => {
            if (MemoryDataChannel.filterRecord(record, filter)) {
                records.push(record);
            }
        });
        if (options) {
            if (options.order) {
                var iteratees = [];
                var orders = [];
                for (var field in options.order) {
                    if (!options.order.hasOwnProperty(field)) {
                        continue;
                    }
                    var order = options.order[field];
                    iteratees.push(field);
                    orders.push(order > 0 ? 'asc': 'desc');
                }
                records = _.sortByOrder(records, iteratees, orders);
            }
            if (options.from) {
                records = _.drop(records, options.from);
            }
            if (options.count) {
                records = _.take(records, options.count);
            }
        }
        callback(null, _.map(records, (record: IRecord) => options && options.getVersion ? record.id + ':' + record.version : record.id ));
    }

    getAllRecords(): IRecord[] {
        return this.records;
    }

    remove(id: string, callback: (error: Error) => void): void {
        var index = _.findIndex(this.records, { id: id });
        if (index < 0) {
            callback(new Error("Cannot find record"));
            return;
        }
        var record = this.recordMap[id];
        this.records.splice(index, 1);
        delete this.recordMap[id];
        this.onChange(Constants.UPDATE_DELETED, id);
        callback(null);
    }

    getVersion(callback: (error: Error, version?: string) => void): void {
        callback(null, this.updates.length.toString());
    }

    getUpdates(from: string, filter: any, options: IQueryOptions, callback: (error: Error, updates?: IUpdate[]) => void): void {
        var updates = from ? _.drop(this.updates, parseInt(from)) : this.updates;

        if (!updates.length || (!filter && !options)) {
            callback(null, updates);
            return;
        }

        this.getIds(filter, options, (error: Error, ids: string[]) => {
            var idsMap = {};
            _.each(ids, (id: string) => {
                idsMap[id] = true;
            });
            updates = _.filter(updates, (update: IUpdate) => idsMap.hasOwnProperty(update.id));
            callback(null, updates);
        });
    }

    private onChange(type:number, id:string):void {
        var update: IUpdate = {
            type: type,
            id: id,
            version: this.updates.length.toString()
        };

        this.updates.push(update);
    }
}
