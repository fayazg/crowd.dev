import { JsonColumnInfo, Operator } from './queryTypes'
import {
  getJsonColumnInfo,
  isSetOperator,
  parseColumnCondition,
  parseJsonColumnCondition,
} from './rawQueryUtils'

export default class RawQueryParser {
  public static parseFilters(
    filters: any,
    columnMap: Map<string, string>,
    jsonColumnInfos: JsonColumnInfo[],
    params: any,
  ): string {
    const keys = Object.keys(filters)
    if (keys.length === 0) {
      return '(1=1)'
    }

    const results = []

    for (const key of keys) {
      if (isSetOperator(key)) {
        const operands = []
        for (const operand of filters[key]) {
          operands.push(this.parseFilters(operand, columnMap, jsonColumnInfos, params))
        }

        const condition = operands.join(` ${key} `)
        results.push(`(${condition})`)
      } else if (key === Operator.NOT) {
        const condition = this.parseFilters(filters[key], columnMap, jsonColumnInfos, params)
        results.push(`(not ${condition})`)
      } else {
        const jsonColumnInfo = getJsonColumnInfo(key, jsonColumnInfos)

        if (jsonColumnInfo === undefined && !columnMap.has(key)) {
          throw new Error(`Unknown filter key: ${key}!`)
        }

        if (jsonColumnInfo) {
          results.push(parseJsonColumnCondition(jsonColumnInfo, filters[key], params))
        } else {
          results.push(parseColumnCondition(key, columnMap.get(key), filters[key], params))
        }
      }
    }

    return results.join(' and ')
  }
}
