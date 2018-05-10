//
// MyRA
//
// Copyright © 2018 Province of British Columbia
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Created by Jason Leach on 2018-05-04.
//

'use strict';

import AgreementType from './agreementtype';
import Client from './client';
import District from './district';
import Model from './model';
import Plan from './plan';
import Usage from './usage';
import Zone from './zone';

export default class Agreement extends Model {
  constructor(data, db = undefined) {
    const obj = {};
    Object.keys(data).forEach((key) => {
      if (Agreement.fields.indexOf(`${Agreement.table}.${key}`) > -1) {
        obj[key] = data[key];
      }
    });

    super(obj, db);

    this.zone = new Zone(Zone.extract(data));
    this.zone.district = new District(District.extract(data));
    this.agreementType = new AgreementType(AgreementType.extract(data));
  }

  static get fields() {
    // primary key *must* be first!
    return ['forest_file_id', 'agreement_start_date', 'agreement_end_date', 'agreement_type_id',
      'agreement_exemption_status_id'].map(f => `${Agreement.table}.${f}`);
  }

  static get table() {
    return 'agreement';
  }

  static async findWithTypeZoneDistrict(db, where, page = undefined, limit = undefined) {
    const myFields = [
      ...Agreement.fields,
      ...Zone.fields.map(f => `${f} AS ${f.replace('.', '_')}`),
      ...District.fields.map(f => `${f} AS ${f.replace('.', '_')}`),
      ...AgreementType.fields.map(f => `${f} AS ${f.replace('.', '_')}`),
    ];

    try {
      let results = [];
      const q = db
        .select(myFields)
        .from(Agreement.table)
        .join('ref_zone', { 'agreement.zone_id': 'ref_zone.id' })
        .join('ref_district', { 'ref_zone.district_id': 'ref_district.id' })
        .join('ref_agreement_type', { 'agreement.agreement_type_id': 'ref_agreement_type.id' })
        .where(where);

      if (page && limit) {
        const offset = limit * (page - 1);
        results = await q
          .offset(offset)
          .limit(limit);
      } else {
        results = await q;
      }

      return results.map(row => new Agreement(row, db));
    } catch (err) {
      throw err;
    }
  }

  static async update(db, where, values) {
    const obj = { ...values, ...{} };
    Object.keys(values).forEach((key) => {
      obj[Model.toSnakeCase(key)] = values[key];
    });

    try {
      const results = await db
        .table(Agreement.table)
        .where(where)
        .update(obj)
        .returning(this.primaryKey);
      const promises = results.map(result =>
        Agreement.findWithTypeZoneDistrict(db, { forest_file_id: result }));

      return Promise.all(promises);
    } catch (err) {
      throw err;
    }
  }

  async fetchClients() {
    const clients = await Client.clientsForAgreement(this.db, this);
    this.clients = clients;
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchPlans() {
    const order = ['id', 'desc'];
    const where = { agreement_id: this.forestFileId };
    const plans = await Plan.findWithStatusExtension(this.db, where, order);
    this.plans = plans;
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchUsage() {
    const order = ['year', 'desc'];
    const where = { agreement_id: this.forestFileId };
    const usage = await Usage.find(this.db, where, order);
    this.usage = usage;
  }
}
