import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkillText,
  renderSkillText,
  validateSkillDefinition,
  invocationOf,
} from '../lib/frontmatter.js';

test('parses scalar frontmatter and body', () => {
  const parsed = parseSkillText(
    '---\nname: demo-skill\ndescription: "Do things: use when asked."\n---\n\n# Demo\n\nStep 1.\n',
  );
  assert.equal(parsed.data.name, 'demo-skill');
  assert.equal(parsed.data.description, 'Do things: use when asked.');
  assert.equal(parsed.body, '# Demo\n\nStep 1.\n');
  assert.deepEqual(parsed.issues, []);
});

test('parses folded block scalar and boolean grammar', () => {
  const parsed = parseSkillText(
    [
      '---',
      'name: block-skill',
      'description: >-',
      '  first line',
      '  second line',
      'disable-model-invocation: yes',
      'user-invocable: "0"',
      '---',
      'body',
      '',
    ].join('\n'),
  );
  assert.equal(parsed.data.description, 'first line second line');
  assert.equal(parsed.data.disableModelInvocation, true);
  // Quoted booleans are strings in YAML, so the strict grammar rejects them.
  assert.ok(parsed.issues.some((issue) => issue.includes('user-invocable')));
});

test('strips YAML comments outside quotes', () => {
  const parsed = parseSkillText('---\nname: comment-skill\ndescription: Do it # not part\n---\n');
  assert.equal(parsed.data.description, 'Do it');
});

test('preserves unknown frontmatter blocks through a rewrite', () => {
  const source = [
    '---',
    'name: legacy-skill',
    'description: old text',
    'license: MIT',
    'metadata:',
    '  owner: platform',
    '---',
    '',
    'Original body.',
    '',
  ].join('\n');
  const parsed = parseSkillText(source);
  assert.equal(parsed.data.license, undefined);
  assert.equal(parsed.data.metadata.owner, 'platform');
  assert.ok(parsed.extras.includes('license: MIT'));

  const rendered = renderSkillText(
    { ...parsed.data, description: 'new text' },
    parsed.body,
    parsed.extras,
  );
  assert.match(rendered, /^---\nname: legacy-skill\ndescription: new text/m);
  assert.match(rendered, /\nlicense: MIT\n/);
  assert.match(rendered, /\nmetadata:\n  owner: platform\n/);
  assert.match(rendered, /Original body\.\n$/);

  const roundTripped = parseSkillText(rendered);
  assert.equal(roundTripped.data.license, undefined);
  assert.ok(roundTripped.extras.includes('license: MIT'));
  assert.equal(roundTripped.body.trim(), 'Original body.');
});

test('escapes descriptions that would otherwise change YAML semantics', () => {
  const description = 'Use when: the user says "release #1"';
  const rendered = renderSkillText({ name: 'escape-skill', description }, 'Body\n');
  const parsed = parseSkillText(rendered);
  assert.equal(parsed.data.description, description);
});

test('rejects a document without delimited frontmatter', () => {
  assert.throws(() => parseSkillText('# Just markdown\n'), /must begin with a YAML frontmatter/);
  assert.throws(() => parseSkillText('---\nname: broken\n'), /missing its closing/);
});

test('validates names, descriptions, bodies, and metadata', () => {
  const invalid = validateSkillDefinition({
    name: 'Bad Name',
    description: '',
    body: 'x',
    metadata: { 'bad key': null },
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes('kebab-case')));
  assert.ok(invalid.errors.some((error) => error.includes('description is required')));
  assert.ok(invalid.errors.some((error) => error.includes('metadata')));

  const longDescription = validateSkillDefinition({
    name: 'long-description',
    description: 'x'.repeat(600),
    body: 'body',
  });
  assert.equal(longDescription.valid, true);
  assert.ok(longDescription.warnings.some((warning) => warning.includes('500')));

  const longBody = validateSkillDefinition({
    name: 'long-body',
    description: 'A skill.',
    body: 'x'.repeat(8000),
  });
  assert.equal(longBody.valid, true);
  assert.ok(longBody.warnings.some((warning) => warning.includes('8192')));
});

test('maps frontmatter flags to the invocation policy', () => {
  assert.deepEqual(invocationOf({}), { modelInvocable: true, userInvocable: true });
  assert.deepEqual(invocationOf({ disableModelInvocation: true }), {
    modelInvocable: false,
    userInvocable: true,
  });
  assert.deepEqual(invocationOf({ userInvocable: false }), {
    modelInvocable: true,
    userInvocable: false,
  });
});
