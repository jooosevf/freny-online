import test from 'node:test';
import assert from 'node:assert/strict';
import { readFeedback, tooMany, MAX_TEXT } from '../api/_lib/feedback.js';

test('a normal feedback is kept as sent', () => {
  const r = readFeedback({ tipo: 'bug', texto: '  O Ciclope atravessou a parede  ', nota: 4, contato: 'jose#1', plataforma: 'pc' });
  assert.deepEqual(r.value, { tipo: 'bug', texto: 'O Ciclope atravessou a parede', nota: 4, contato: 'jose#1', plataforma: 'pc' });
});

test('optional fields can be left out', () => {
  const r = readFeedback({ tipo: 'ideia', texto: 'Mais armas', contato: '', nota: undefined });
  assert.deepEqual(r.value, { tipo: 'ideia', texto: 'Mais armas' });
});

test('bad input is refused', () => {
  assert.ok(readFeedback({ tipo: 'xingamento', texto: 'qualquer coisa' }).error);
  assert.ok(readFeedback({ tipo: 'bug', texto: 'oi' }).error);
  assert.ok(readFeedback({ tipo: 'bug', texto: 'x'.repeat(MAX_TEXT + 1) }).error);
  assert.ok(readFeedback({ tipo: 'bug', texto: 'nota estranha', nota: 9 }).error);
  assert.ok(readFeedback(null).error);
});

test('the hidden field marks a bot', () => {
  assert.equal(readFeedback({ tipo: 'bug', texto: 'compre agora', site: 'http://spam' }).error, 'spam');
});

test('one address can send a few in a row, then waits', () => {
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(tooMany('a', t + i), false);
  assert.equal(tooMany('a', t + 10), true);
  assert.equal(tooMany('b', t + 10), false);
  assert.equal(tooMany('a', t + 11 * 60 * 1000), false);
});
