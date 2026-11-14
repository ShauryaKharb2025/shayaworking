const { Prisma } = require("@prisma/client");
const { randomUUID } = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const prisma = require("./prisma");
const context = new AsyncLocalStorage();
const client = () => context.getStore() || prisma;
const registry = {};
const definitions = Object.fromEntries(Prisma.dmmf.datamodel.models.map(m => [m.name, m]));
const clone = value => JSON.parse(JSON.stringify(value));
const idOf = value => value && typeof value === "object" ? value._id || value.id : value;
function fieldName(model, field) {
  if (field === "_id") return "id";
  const def = definitions[model].fields.find(f => f.name === field);
  return def?.kind === "object" ? def.relationFromFields[0] : field;
}
function where(model, filter = {}) {
  const result = {};
  for (const [key, value] of Object.entries(filter)) {
    const field = fieldName(model, key);
    if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      const operators = {};
      for (const [op, operand] of Object.entries(value)) {
        const names = { $in: "in", $nin: "notIn", $ne: "not", $lte: "lte", $lt: "lt", $gte: "gte", $gt: "gt" };
        if (op === "$exists") operators.not = operand ? null : undefined;
        else if (names[op]) operators[names[op]] = Array.isArray(operand) ? operand.map(idOf) : idOf(operand);
        else throw new Error("Unsupported query operator: " + op);
      }
      result[field] = value.$exists === false ? null : operators;
    } else result[field] = idOf(value);
  }
  return result;
}
function data(model, input) {
  const result = {};
  for (const field of definitions[model].fields) {
    if (field.kind === "object" || ["createdAt", "updatedAt", "version"].includes(field.name)) continue;
    const relation = definitions[model].fields.find(f => f.kind === "object" && f.relationFromFields?.includes(field.name));
    let value = relation && Object.hasOwn(input, relation.name) ? idOf(input[relation.name]) : input[field.name];
    if (field.name === "id") value = input._id || input.id;
    if (value === undefined) continue;
    if (field.type === "DateTime" && value !== null) value = new Date(value);
    if (field.type === "Json") {
      if (value === null) value = Prisma.DbNull;
      else {
        value = clone(value);
        if (["events", "messages"].includes(field.name)) value = value.map(item => ({ ...item, _id: item._id || randomUUID(), at: item.at || new Date().toISOString() }));
      }
    }
    result[field.name] = value;
  }
  if (model === "User") {
    if (result.email) result.email = result.email.trim().toLowerCase();
    if (result.name) result.name = result.name.trim();
  }
  return result;
}
function project(doc, selection) {
  if (!doc || !selection) return doc;
  const fields = selection.split(/\s+/).filter(Boolean);
  const output = { _id: doc._id };
  for (const field of fields) if (!field.startsWith("-") && doc[field] !== undefined) output[field] = doc[field];
  return output;
}
class Document {
  constructor(model, row) {
    Object.defineProperties(this, { _model: { value: model }, _version: { value: row.version, writable: true }, _baseline: { value: null, writable: true } });
    Object.assign(this, row);
    this._id = row.id;
    delete this.id; delete this.version;
    for (const field of definitions[model].fields.filter(f => f.kind === "object" && f.relationFromFields?.length)) {
      this[field.name] = row[field.relationFromFields[0]];
      delete this[field.relationFromFields[0]];
    }
    delete this.passwordHash;
    this._baseline = clone(data(model, this));
  }
  async save() {
    const current = data(this._model, this);
    const changed = {};
    for (const [key, value] of Object.entries(current)) if (key !== "id" && JSON.stringify(value) !== JSON.stringify(this._baseline[key])) changed[key] = value;
    if (!Object.keys(changed).length) return this;
    const saved = await client()[this._model[0].toLowerCase() + this._model.slice(1)].updateMany({
      where: { id: this._id, version: this._version },
      data: { ...changed, version: { increment: 1 } }
    });
    if (!saved.count) throw Object.assign(new Error("Record changed; reload and retry"), { status: 409 });
    this._version++;
    this._baseline = clone(current);
    if (changed.messages) this.messages = changed.messages;
    return this;
  }
  async populate(spec, selection) {
    const specs = Array.isArray(spec) ? spec : [typeof spec === "string" ? { path: spec, select: selection } : spec];
    for (const item of specs) {
      const field = definitions[this._model].fields.find(f => f.name === item.path && f.kind === "object");
      if (!field) throw new Error("Unknown relation: " + item.path);
      const id = idOf(this[item.path]);
      if (!id) continue;
      let related = await registry[field.type].findById(id);
      if (related && item.populate) await related.populate(item.populate);
      this[item.path] = project(related, item.select);
    }
    return this;
  }
  toJSON() { return { ...this }; }
}
class Query {
  constructor(model, execute) { this.model = model; this.execute = execute; this.populations = []; this.options = {}; }
  populate(spec, selection) { this.populations.push(typeof spec === "string" ? { path: spec, select: selection } : spec); return this; }
  select(selection) { this.selection = selection; return this; }
  sort(order) { this.options.orderBy = Object.entries(order).map(([key, value]) => ({ [fieldName(this.model, key)]: value === -1 ? "desc" : "asc" })); return this; }
  limit(take) { this.options.take = take; return this; }
  async run() {
    const result = await this.execute(this.options);
    const hydrate = async row => {
      if (!row) return null;
      const doc = new Document(this.model, row);
      for (const spec of this.populations) await doc.populate(spec);
      return this.selection ? project(doc, this.selection) : doc;
    };
    return Array.isArray(result) ? Promise.all(result.map(hydrate)) : hydrate(result);
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}
function repository(model) {
  if (registry[model]) return registry[model];
  const table = () => client()[model[0].toLowerCase() + model.slice(1)];
  const api = {
    find: (filter = {}) => new Query(model, options => table().findMany({ where: where(model, filter), ...options })),
    findOne: (filter = {}) => new Query(model, options => table().findFirst({ where: where(model, filter), ...options })),
    findById: id => new Query(model, () => table().findUnique({ where: { id: String(idOf(id)) } })),
    create: async input => new Document(model, await table().create({ data: data(model, input) })),
    exists: async filter => Boolean(await table().findFirst({ where: where(model, filter), select: { id: true } })),
    findByIdAndUpdate: (id, update, options) => api.findOneAndUpdate({ _id: id }, update, options),
    findOneAndUpdate: (filter, update, options = {}) => new Query(model, async () => {
      return transaction(async () => {
        const existing = await table().findFirst({ where: where(model, filter) });
        if (!existing) {
          if (!options.upsert) return null;
          return table().create({ data: data(model, { ...filter, ...(update.$set || update) }) });
        }
        const changes = data(model, update.$set || update);
        for (const [field, value] of Object.entries(update.$push || {})) changes[field] = [...(existing[field] || []), { ...clone(value), _id: randomUUID(), at: value.at || new Date().toISOString() }];
        const result = await table().updateMany({ where: { ...where(model, filter), id: existing.id, version: existing.version }, data: { ...changes, version: { increment: 1 } } });
        if (!result.count) return null;
        return options.new !== true ? existing : table().findUnique({ where: { id: existing.id } });
      });
    }),
  };
  registry[model] = api;
  return api;
}
async function transaction(fn) {
  if (context.getStore()) return fn();
  return prisma.$transaction(tx => context.run(tx, fn));
}
for (const model of Object.keys(definitions)) repository(model);
module.exports = { repository, transaction, client };
