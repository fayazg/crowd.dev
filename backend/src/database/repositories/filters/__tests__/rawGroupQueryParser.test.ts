import { Operator } from '../queryTypes'
import RawGroupQueryParser from '../rawGroupQueryParser'

describe('RawGroupQueryParser', () => {
  it('Should throw an error when no filters are provided', () => {
    const filter = {}
    const group = {
      name: 'basic',
      columnMap: new Map([['lastActive', 'aggs."lastActive"']]),
      jsonColumnInfos: [],
    }

    try {
      RawGroupQueryParser.parseGroupFilters(filter, [group])
      fail('Should have thrown an error when no filters provided!')
    } catch (e) {
      expect(e.message).toEqual('No filters provided!')
    }
  })

  it('Should throw an error when no groups are provided', () => {
    const basicFilter = {
      and: [
        {
          isOrganization: {
            not: true,
          },
        },
        {},
      ],
    }

    try {
      RawGroupQueryParser.parseGroupFilters(basicFilter, [])
      fail('Should have thrown an error when no groups provided!')
    } catch (e) {
      expect(e.message).toEqual('No groups provided!')
    }
  })

  it('Should throw an error when multiple root operators are provided', () => {
    const basicFilter = {
      and: [
        {
          isOrganization: {
            not: true,
          },
        },
        {},
      ],
      or: [
        {
          isBot: {
            eq: false,
          },
        },
        {},
      ],
    }
    const group = {
      name: 'basic',
      columnMap: new Map([['lastActive', 'aggs."lastActive"']]),
      jsonColumnInfos: [],
    }

    try {
      RawGroupQueryParser.parseGroupFilters(basicFilter, [group])
      fail('Should have thrown an error when multiple root operators are provided!')
    } catch (e) {
      expect(e.message).toEqual('Only one set operator should be provided as root key!')
    }
  })

  it('Should throw an error when root operator is not a set operator', () => {
    const basicFilter = {
      not: [
        {
          isOrganization: {
            not: true,
          },
        },
        {},
      ],
    }
    const group = {
      name: 'basic',
      columnMap: new Map([['lastActive', 'aggs."lastActive"']]),
      jsonColumnInfos: [],
    }

    try {
      RawGroupQueryParser.parseGroupFilters(basicFilter, [group])
      fail('Should have thrown an error when root operator is not a set operator!')
    } catch (e) {
      expect(e.message).toEqual('Invalid root operator: not!')
    }
  })

  it('Should parse simple one group filter', () => {
    const basicFilter = {
      and: [
        {
          isOrganization: {
            not: true,
          },
        },
        {},
      ],
    }

    const group = {
      name: 'basic',
      columnMap: new Map([
        [
          'isOrganization',
          "coalesce((m.attributes -> 'isOrganization' -> 'default')::boolean, false)",
        ],
      ]),
      jsonColumnInfos: [],
    }
    const result = RawGroupQueryParser.parseGroupFilters(basicFilter, [group])

    expect(result.filters.size).toEqual(1)
    const filters = result.filters.get('basic')
    expect(filters.length).toBe(1)

    expect(filters[0].conditions).toEqual([
      "(coalesce((m.attributes -> 'isOrganization' -> 'default')::boolean, false) <> :isOrganization_1)",
    ])
    expect(filters[0].operator).toEqual(Operator.AND)
    expect(result.params).toEqual({ isOrganization_1: true })
  })

  it('Should parse simple multi-group query', () => {
    const basicFilter = {
      and: [
        {
          isOrganization: {
            not: true,
          },
        },
        {
          isBot: {
            eq: false,
          },
        },
      ],
    }

    const group1 = {
      name: 'first',
      columnMap: new Map([
        [
          'isOrganization',
          "coalesce((m.attributes -> 'isOrganization' -> 'default')::boolean, false)",
        ],
      ]),
      jsonColumnInfos: [],
    }

    const group2 = {
      name: 'second',
      columnMap: new Map([
        ['isBot', "coalesce((m.attributes -> 'isBot' -> 'default')::boolean, false)"],
      ]),
      jsonColumnInfos: [],
    }

    const result = RawGroupQueryParser.parseGroupFilters(basicFilter, [group1, group2])

    expect(result.filters.size).toEqual(2)
    expect(result.params).toEqual({
      isOrganization_1: true,
      isBot_1: false,
    })

    const firstGroupFilters = result.filters.get('first')
    expect(firstGroupFilters.length).toBe(1)
    expect(firstGroupFilters[0].conditions).toEqual([
      "(coalesce((m.attributes -> 'isOrganization' -> 'default')::boolean, false) <> :isOrganization_1)",
    ])
    expect(firstGroupFilters[0].operator).toEqual(Operator.AND)

    const secondGroupFilters = result.filters.get('second')
    expect(secondGroupFilters.length).toBe(1)
    expect(secondGroupFilters[0].conditions).toEqual([
      "coalesce((m.attributes -> 'isBot' -> 'default')::boolean, false) = :isBot_1)",
    ])
    expect(secondGroupFilters[0].operator).toEqual(Operator.AND)
  })
})
