const Joi = require('joi');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message }))
      });
    }
    req.body = value;
    next();
  };
}

// Schemas
const schemas = {
  login: Joi.object({
    username: Joi.string().trim().min(2).max(50).required(),
    password: Joi.string().min(4).required()
  }),

  employee: Joi.object({
    employee_id: Joi.string().trim().max(20).optional().allow('', null),
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().optional().allow('', null),
    department: Joi.string().trim().max(100).optional().allow('', null),
    position: Joi.string().trim().max(100).optional().allow('', null),
    mobile_phone: Joi.string().trim().max(20).optional().allow('', null),
    desk_phone: Joi.string().trim().max(20).optional().allow('', null),
    location: Joi.string().trim().max(100).optional().allow('', null)
  }),

  equipment: Joi.object({
    asset_tag: Joi.string().trim().max(50).optional().allow('', null),
    category: Joi.string().trim().max(50).required(),
    brand: Joi.string().trim().max(50).optional().allow('', null),
    model: Joi.string().trim().max(100).optional().allow('', null),
    serial_number: Joi.string().trim().max(100).optional().allow('', null),
    status: Joi.string().valid('available','assigned','maintenance','retired','lost').default('available'),
    condition: Joi.string().valid('excellent','good','fair','poor').default('good'),
    purchase_date: Joi.string().optional().allow('', null),
    purchase_price: Joi.number().min(0).optional().allow(null),
    warranty_expiry: Joi.string().optional().allow('', null),
    location: Joi.string().trim().max(100).optional().allow('', null),
    notes: Joi.string().max(500).optional().allow('', null)
  }),

  assignment: Joi.object({
    employee_id: Joi.number().integer().positive().required(),
    equipment_id: Joi.number().integer().positive().required(),
    expected_return: Joi.string().optional().allow('', null),
    notes: Joi.string().max(500).optional().allow('', null)
  }),

  returnAssignment: Joi.object({
    return_reason: Joi.string().trim().min(2).max(200).required(),
    condition_on_return: Joi.string().valid('excellent','good','fair','poor').default('good'),
    notes: Joi.string().max(500).optional().allow('', null)
  })
};

module.exports = { validate, schemas };
