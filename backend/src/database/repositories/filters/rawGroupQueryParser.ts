import { JsonColumnInfo, Operator, ParsedJsonColumn } from './queryTypes'
import {
  getJsonColumnInfo,
  isSetOperator,
  parseColumnCondition,
  parseJsonColumnCondition,
} from './rawQueryUtils'

export interface GroupFilterParameters {
  name: string
  columnMap: Map<string, string>
  jsonColumnInfos: JsonColumnInfo[]
}

export interface GroupConditions {
  groupName: string
  conditions: string[]
}

export interface FilterNode {
  operator: Operator.AND | Operator.OR
  groups: GroupConditions[]
  childNodes: FilterNode[]
}

export interface ParseGroupFilterResult {
  params: any
  filters: FilterNode
}

export default class RawGroupQueryParser {
  public static parseGroupFilters(
    filters: any,
    groups: GroupFilterParameters[],
  ): ParseGroupFilterResult {
    if (groups.length === 0) {
      throw new Error('No groups provided!')
    }

    const keys = Object.keys(filters)
    if (keys.length === 0) {
      throw new Error('No filters provided!')
    }

    if (keys.length !== 1) {
      throw new Error('Only one set operator should be provided as root key!')
    }

    const rootOperator = keys[0] as Operator
    if (!isSetOperator(rootOperator)) {
      throw new Error(`Invalid root operator: ${rootOperator}!`)
    }

    const rootNode: FilterNode = {
      operator: rootOperator as Operator.AND | Operator.OR,
      groups: [],
      childNodes: [],
    }

    // we have multiple groups of filters and columns for multiple queries
    // have to build filter based o group that it belongs to
    const params = {}

    this.parseGroupFiltersInternal(rootNode, filters, params, groups)

    return {
      params,
      filters: rootNode,
    }
  }

  private static parseGroupFiltersInternal(
    parentNode: FilterNode,
    filters: any,
    params: any,
    groups: GroupFilterParameters[],
  ) {
    const keys = Object.keys(filters)
    if (keys.length === 0) {
      return
    }

    for (const key of keys) {
      if (isSetOperator(key)) {
        const operator = key as Operator.AND | Operator.OR

        const newParent: FilterNode = {
          operator,
          groups: [],
          childNodes: [],
        }

        this.parseGroupFiltersInternal(newParent, filters[key], params, groups)

        parentNode.childNodes.push(newParent)
      } else if (key === Operator.NOT) {
        // handle not operator on the actual condition
        // we support only one condition for a not operator and not multiple to avoid multi group not conditions

        const childFilter = filters[key]
        if (Object.keys(childFilter).length !== 1) {
          throw new Error('Only one child condition is supported for not operator!')
        }

        const tempNode: FilterNode = {
          operator: Operator.AND,
          groups: [],
          childNodes: [],
        }

        this.parseGroupFiltersInternal(tempNode, childFilter, params, groups)

        if (tempNode.groups.length !== 1) {
          throw new Error('Something went wrong - we need to have a single group here!')
        }

        const newGroup = tempNode.groups[0]

        let added = false
        for (const existingGroup of parentNode.groups) {
          if (existingGroup.groupName === newGroup.groupName) {
            // add to this group
            existingGroup.conditions.push(...newGroup.conditions.map((c) => `not (${c})`))
            added = true
          }
        }

        if (!added) {
          parentNode.groups.push({
            groupName: newGroup.groupName,
            conditions: newGroup.conditions.map((c) => `not (${c})`),
          })
        }
      } else {
        // regular operator that has a value or list of values

        // find the group that this filter belongs to
        let groupDefinition: GroupFilterParameters | undefined
        let jsonColumnInfo: ParsedJsonColumn | undefined

        for (const g of groups) {
          jsonColumnInfo = getJsonColumnInfo(key, g.jsonColumnInfos)
          if (jsonColumnInfo) {
            groupDefinition = g
            break
          } else if (g.columnMap.has(key)) {
            groupDefinition = g
            break
          }
        }

        if (groupDefinition === undefined) {
          throw new Error(`Invalid filter property: ${key}!`)
        }

        let group: GroupConditions
        for (const existingGroup of parentNode.groups) {
          if (existingGroup.groupName === groupDefinition.name) {
            group = existingGroup
            break
          }
        }

        if (!group) {
          group = {
            groupName: groupDefinition.name,
            conditions: [],
          }
        }

        if (jsonColumnInfo) {
          group.conditions.push(parseJsonColumnCondition(jsonColumnInfo, filters[key], params))
        } else {
          group.conditions.push(
            parseColumnCondition(key, groupDefinition.columnMap.get(key), filters[key], params),
          )
        }
      }
    }
  }
}
