import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { buildSkillPrompt, discoverSkills } from '../skill-loader.js'

describe('discoverSkills', () => {
  it('returns empty for non-existent dir', () => {
    assert.deepEqual(discoverSkills('/nonexistent'), [])
  })

  it('discovers SKILL.md files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-test-'))
    const skillDir = join(dir, 'my-skill')
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, 'SKILL.md'), '# My Skill\nDoes stuff.')

    const skills = discoverSkills(dir)
    assert.equal(skills.length, 1)
    assert.equal(skills[0]?.name, 'my-skill')
    assert.ok(skills[0]?.content.includes('My Skill'))

    rmSync(dir, { recursive: true, force: true })
  })

  it('skips directories without SKILL.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-test-'))
    mkdirSync(join(dir, 'no-skill'))
    mkdirSync(join(dir, 'has-skill'))
    writeFileSync(join(dir, 'has-skill', 'SKILL.md'), 'content')

    const skills = discoverSkills(dir)
    assert.equal(skills.length, 1)
    assert.equal(skills[0]?.name, 'has-skill')

    rmSync(dir, { recursive: true, force: true })
  })
})

describe('buildSkillPrompt', () => {
  it('returns empty for no skills', () => {
    assert.equal(buildSkillPrompt([]), '')
  })

  it('concatenates skill content', () => {
    const result = buildSkillPrompt([
      { name: 'a', content: 'Skill A', path: '/a/SKILL.md' },
      { name: 'b', content: 'Skill B', path: '/b/SKILL.md' },
    ])
    assert.ok(result.includes('Skill A'))
    assert.ok(result.includes('Skill B'))
  })
})
