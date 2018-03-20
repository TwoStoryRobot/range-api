//
// SecureImage
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
// Created by Jason Leach on 2018-01-18.
//

/* eslint-env es6 */

'use strict';

import { Router } from 'express';
// import deepDiff from 'deep-diff';
import { isAuthenticated } from '../../libs/auth';
import {
  asyncMiddleware,
  errorWithCode,
  isNumeric,
} from '../../libs/utils';
import { logger } from '../../libs/logger';
import config from '../../config';
import DataManager from '../../libs/db';

const dm = new DataManager(config);
const {
  Client,
  Usage,
  Agreement,
  AgreementStatus,
  Zone,
  District,
  LivestockIdentifier,
  LivestockIdentifierLocation,
  LivestockIdentifierType,
  Pasture,
  GrazingSchedule,
  GrazingScheduleEntry,
  LivestockType,
} = dm;

const router = new Router();

// Includes all nested json data for Agreement

const allAgreementChildren = [
  {
    model: Zone,
    include: [District],
    attributes: {
      exclude: ['district_id'],
    },
  },
  {
    model: LivestockIdentifier,
    include: [LivestockIdentifierLocation, LivestockIdentifierType],
    attributes: {
      exclude: ['livestock_identifier_type_id', 'livestock_identifier_location_id'],
    },
  },
  {
    model: Pasture,
  },
  {
    model: GrazingSchedule,
    include: [{
      model: GrazingScheduleEntry,
      include: [LivestockType, Pasture],
      attributes: {
        exclude: ['grazing_schedule_id', 'livestock_type_id', 'agreement_grazing_schedule'],
      },
    }],
  },
  {
    model: Client,
    as: 'primaryAgreementHolder',
    attributes: {
      exclude: ['client_type_id'],
    },
  },
  {
    model: Usage,
    as: 'usage',
    attributes: {
      exclude: ['agreement_id'],
    },
  },
  {
    model: AgreementStatus,
    as: 'status',
    attributes: {
      exclude: ['active'],
    },
  },
];
const excludedAgreementAttributes = ['primary_agreement_holder_id', 'agreement_type_id', 'zone_id',
  'extension_id', 'status_id'];

// Create agreement
router.post('/', isAuthenticated, asyncMiddleware(async (req, res) => {
  res.status(501).json({ error: 'Not Implemented' }).end();
}));

// Get all
router.get('/', isAuthenticated, asyncMiddleware(async (req, res) => {
  try {
    const agreements = await Agreement.findAll({
      include: allAgreementChildren,
      attributes: {
        exclude: excludedAgreementAttributes,
      },
    });

    res.status(200).json(agreements).end();
  } catch (err) {
    throw err;
  }
}));

// Update
router.put('/:id', isAuthenticated, asyncMiddleware(async (req, res) => {
  const {
    id,
  } = req.params;

  const {
    body,
  } = req;

  try {
    const agreement = await Agreement.findOne({
      where: {
        id,
      },
      include: allAgreementChildren,
      attributes: {
        exclude: excludedAgreementAttributes,
      },
    });

    if (!agreement) {
      res.status(404).end();
    }

    /* const changes = deepDiff.diff(
      agreement.get({ plain: true }),
      agreement2.get({ plain: true })
    );

    if (changes) {
      res.status(200).json([agreement, agreement2, changes]).end();
    } */

    const count = await Agreement.update(body, {
      where: {
        id,
      },
    });

    if (count[0] === 0) {
      // No records were updated. The ID probably does not exists.
      res.send(400).json().end(); // Bad Request
    }

    res.status(200).json(agreement).end();
  } catch (error) {
    logger.error(`error updating agreement ${id}`);
    throw error;
  }
}));

// Get by id
router.get('/:id', isAuthenticated, asyncMiddleware(async (req, res) => {
  try {
    const {
      id,
    } = req.params;

    const agreement = await Agreement.findOne({
      where: {
        id,
      },
      include: allAgreementChildren,
      attributes: {
        exclude: excludedAgreementAttributes,
      },
    });

    if (agreement != null) {
      res.status(200).json(agreement).end();
    } else {
      res.status(404).json({ error: 'Not found' }).end();
    }
  } catch (err) {
    throw err;
  }
}));

//
// Agreement Status
//

// Update the status of an agreement
router.put('/:agreementId?/status/:statusId?', isAuthenticated, asyncMiddleware(async (req, res) => {
  const {
    agreementId,
    statusId,
  } = req.params;

  if ((!agreementId || !statusId) || (!isNumeric(agreementId) || !isNumeric(statusId))) {
    throw errorWithCode('Both agreementId and statusId must be provided and be numeric', 400);
  }

  try {
    const agreement = await Agreement.findById(agreementId);
    if (!agreement) {
      throw errorWithCode(`No Agreement with ID ${agreementId} exists`, 400);
    }

    const status = await AgreementStatus.findOne({
      where: {
        id: statusId,
      },
      attributes: {
        exclude: ['updatedAt', 'createdAt', 'active'],
      },
    });
    if (!status) {
      throw errorWithCode(`No Status with ID ${statusId} exists`, 400);
    }

    await agreement.setStatus(status);

    return res.status(200).json(status).end();
  } catch (err) {
    throw err;
  }
}));

//
// Agreement Zone
//

// Update the zone of an agreement
router.put('/:agreementId?/zone/:zoneId?', isAuthenticated, asyncMiddleware(async (req, res) => {
  const {
    agreementId,
    zoneId,
  } = req.params;

  if (!agreementId || !zoneId || !isNumeric(agreementId) || !isNumeric(zoneId)) {
    throw errorWithCode('Both agreementId and zoneId must be provided and be numaric', 400);
  }

  try {
    const agreement = await Agreement.findById(agreementId);
    if (!agreement) {
      throw errorWithCode(`No Agreement with ID ${agreementId} exists`, 400);
    }

    const zone = await Zone.findOne({
      where: {
        id: zoneId,
      },
      attributes: {
        exclude: ['updatedAt', 'createdAt'],
      },
    });

    await agreement.setZone(zone);
    return res.status(200).json(zone).end();
  } catch (err) {
    throw err;
  }
}));

//
// Agreement Livestock Identifier
//

// create a livestock identifier in an agreement
router.post('/:id?/livestockidentifier', isAuthenticated, asyncMiddleware(async (req, res) => {
  res.status(501).json({ error: 'not implemented yet' }).end();

  const {
    id,
  } = req.params;

  if (!isNumeric(id)) {
    throw errorWithCode('agreementId must be provided and be numaric', 400);
  }

  const {
    body,
  } = req;

  // TODO: validate fields in body
  try {
    const agreement = await Agreement.findOne({
      where: {
        id,
      },
    });

    const livestockIdentifier = await LivestockIdentifier.create(body);

    await agreement.addLivestockIdentifier(livestockIdentifier);
    await agreement.save();

    res.status(200).json(livestockIdentifier).end();
  } catch (err) {
    throw err;
  }
}));

// get all livestock identifiers of an agreement
router.get('/:agreementId?/livestockidentifier', isAuthenticated, asyncMiddleware(async (req, res) => {
  const {
    agreementId,
  } = req.params;

  if (!agreementId || !isNumeric(agreementId)) {
    throw errorWithCode('agreementId must be provided and be numaric', 400);
  }

  try {
    const livestockIdentifiers = await LivestockIdentifier.findAll({
      where: {
        agreementId,
      },
    });

    return res.status(200).json(livestockIdentifiers).end();
  } catch (err) {
    throw err;
  }
}));

router.put('/:agreementId?/livestockidentifier/:livestockIdentifierId?', isAuthenticated, asyncMiddleware(async (req, res) => {
  const {
    agreementId,
    livestockIdentifierId,
  } = req.params;

  const {
    body,
  } = req;

  if (
    !agreementId
    || !livestockIdentifierId
    || !isNumeric(agreementId)
    || !isNumeric(livestockIdentifierId)
  ) {
    throw errorWithCode('agreementId and livestockIdentifierId must be provided and be numaric', 400);
  }

  try {
    const [affectedCount] = await LivestockIdentifier.update(body, {
      where: {
        agreementId,
        id: livestockIdentifierId,
      },
    });

    if (!affectedCount) {
      throw errorWithCode(`No livestock identifier with ID ${livestockIdentifierId} exists`, 400);
    }

    const livestockIdentifier = await LivestockIdentifier.findOne({
      where: {
        id: livestockIdentifierId,
      },
      attributes: {
        exclude: ['updatedAt', 'createdAt'],
      },
    });

    return res.status(200).json(livestockIdentifier);
  } catch (err) {
    throw err;
  }
}));

export default router;
