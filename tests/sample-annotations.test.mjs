import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { annotationRequest, selectionRecord } from '../scripts/sample-annotation-policy.mjs';
import { buildInventory } from '../scripts/sample-annotations/catalog';
const schema=JSON.parse(readFileSync('docs/sample-annotation-schema-v2.json','utf8'));
describe('sample inventory and category policy',()=>{
 it('covers all six indexes, preserves ownership, aliases, repairs and note maps',()=>{
  const files=buildInventory(process.cwd());
  expect(files).toHaveLength(6495);
  expect(new Set(files.map(f=>f.id)).size).toBe(files.length);
  expect(files.filter(f=>f.key==='hh'&&f.active).every(f=>f.library==='uzu-drumkit')).toBe(true);
  expect(files.find(f=>f.key==='RolandTR808_bd').aliases).toContain('TR808_bd');
  expect(files.find(f=>f.library==='vcsl'&&f.key==='tom_mallet').path).toMatch(/^Membranophones\//);
  expect(files.find(f=>f.key==='piano').rootNote).not.toBeNull();
 });
 it('omits guessed source fields for known categories and isolates unknown candidates',()=>{
  const before=structuredClone(schema);
  const req=annotationRequest(schema,'test',{catalogCategory:'萨克斯'});
  expect(req.schema.properties.source).toBeUndefined();
  expect(req.schema.required).not.toContain('source');
  expect(schema).toEqual(before);
  expect(annotationRequest(schema,'test',{}).schema).toBe(schema);
  const known=selectionRecord({sample:{catalogCategory:'萨克斯'},schemaValid:true,annotation:{source:{family:'synth'}}});
  expect(known.category).toBe('萨克斯');
  expect(known.categoryCandidatesForReview).toBeNull();
  const unknown=selectionRecord({sample:{},schemaValid:true,annotation:{source:{family:'synth'}}});
  expect(unknown.category).toBeNull();
  expect(unknown.categoryCandidatesForReview).toEqual({family:'synth'});
  expect(new Ajv().compile(req.schema)).toBeTypeOf('function');
 });
});

import { estimatedCost, reserveCharge } from '../scripts/sample-annotations/budget.mjs';
describe('budget checkpoints',()=>{
 it('reserves synchronously for concurrent workers and preserves uncertain charges on restart',()=>{
  const ledger={inputTokens:0,outputTokens:0,reserved:0,attempts:0};
  expect(reserveCharge(ledger,25,40)).toBe(true);
  expect(reserveCharge(ledger,25,40)).toBe(false);
  const restored=JSON.parse(JSON.stringify(ledger));
  expect(estimatedCost(restored)).toBe(25);
  expect(reserveCharge(restored,16,40)).toBe(false);
  expect(restored.attempts).toBe(1);
 });
});
