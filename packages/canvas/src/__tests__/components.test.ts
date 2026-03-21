import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createButton } from '../components/button.js'
import { createChart } from '../components/chart.js'
import { createForm } from '../components/form.js'
import { createMarkdown } from '../components/markdown.js'
import { createTable } from '../components/table.js'

describe('Component helpers', () => {
  it('createForm produces form component', () => {
    const c = createForm('f1', {
      title: 'Login',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'pass', label: 'Password', type: 'text' },
      ],
    })
    assert.equal(c.id, 'f1')
    assert.equal(c.type, 'form')
    assert.equal(c.props.title, 'Login')
    assert.equal((c.props.fields as unknown[]).length, 2)
    assert.equal(c.props.submitLabel, 'Submit')
  })

  it('createTable produces table component', () => {
    const c = createTable('t1', {
      title: 'Users',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role' },
      ],
      rows: [{ name: 'Alice', role: 'admin' }],
    })
    assert.equal(c.type, 'table')
    assert.equal((c.props.rows as unknown[]).length, 1)
  })

  it('createChart produces chart component', () => {
    const c = createChart('ch1', {
      type: 'bar',
      labels: ['Jan', 'Feb'],
      datasets: [{ label: 'Sales', data: [10, 20] }],
    })
    assert.equal(c.type, 'chart')
    assert.equal(c.props.chartType, 'bar')
  })

  it('createButton produces button component', () => {
    const c = createButton('b1', {
      label: 'Click me',
      actionType: 'submit',
      variant: 'danger',
    })
    assert.equal(c.type, 'button')
    assert.equal(c.props.label, 'Click me')
    assert.equal(c.props.variant, 'danger')
  })

  it('createMarkdown produces markdown component', () => {
    const c = createMarkdown('m1', { content: '# Hello' })
    assert.equal(c.type, 'markdown')
    assert.equal(c.props.content, '# Hello')
  })

  it('order is set when provided', () => {
    const c = createButton('b1', {
      label: 'Test',
      actionType: 'click',
      order: 5,
    })
    assert.equal(c.order, 5)
  })

  it('order is undefined when not provided', () => {
    const c = createMarkdown('m1', { content: 'test' })
    assert.equal(c.order, undefined)
  })
})
