// The contract: required elements for each record type. Unknown fields are allowed,
// so a project can extend its records without breaking readers. CONTRACT.md documents it; a test keeps the two in step.
//   event     what moved          journal.jsonl     (observe)
//   state     where things stand  state/<key>.mdx   (apply)
//   relation  what connects       memory.dot        (learn)

export const EVENT_FIELDS = ["id", "at", "type", "actor", "data"];
export const STATE_FIELDS = ["key", "value", "at", "cause", "version"];
export const RELATION_FIELDS = ["from", "type", "to", "weight", "evidence"];
export const ACTOR_ROLES = ["person", "agent", "tool"];

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const EVENT_ID = /^e-[a-z0-9-]+$/;
const STATE_KEY = /^[A-Za-z0-9_-]+$/;
const RELATION_TYPE = /^[a-z][a-z0-9_-]*$/;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";

function check(record, fields, rules) {
  if (!isObject(record)) return ["not an object"];
  const errors = fields.filter((field) => !(field in record)).map((field) => `missing ${field}`);
  for (const [field, valid, message] of rules) {
    if (field in record && !valid(record[field])) errors.push(message.startsWith(".") ? `${field}${message}` : `${field} ${message}`);
  }
  return errors;
}

export function validateEvent(event) {
  return check(event, EVENT_FIELDS, [
    ["id", (v) => EVENT_ID.test(String(v)), "must look like e-<letters, digits or dashes>"],
    ["at", (v) => ISO_TIME.test(String(v)), "must be an ISO 8601 UTC time"],
    ["type", isText, "must be a non-empty string"],
    ["actor", (v) => isObject(v) && ACTOR_ROLES.includes(v.role), `.role must be one of: ${ACTOR_ROLES.join(", ")}`],
    ["data", isObject, "must be an object"],
  ]);
}

export function validateState(state) {
  return check(state, STATE_FIELDS, [
    ["key", (v) => STATE_KEY.test(String(v)), "must use only letters, digits, _ or -"],
    ["at", (v) => ISO_TIME.test(String(v)), "must be an ISO 8601 UTC time"],
    ["cause", (v) => EVENT_ID.test(String(v)), "must be the id of the event that caused it"],
    ["version", (v) => Number.isInteger(v) && v >= 1, "must be a whole number from 1"],
  ]);
}

export function validateRelation(relation) {
  return check(relation, RELATION_FIELDS, [
    ["from", isText, "must be a non-empty string"],
    ["type", (v) => RELATION_TYPE.test(String(v)), "must be a lowercase verb such as follows or prefers"],
    ["to", isText, "must be a non-empty string"],
    ["weight", Number.isFinite, "must be a number"],
    ["evidence", (v) => Array.isArray(v) && v.every((id) => EVENT_ID.test(String(id))), "must be a list of event ids"],
  ]);
}
