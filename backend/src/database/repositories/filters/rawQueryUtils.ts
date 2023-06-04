import { singleOrDefault } from '@crowd/common'
import { AttributeType } from '../../attributes/types'
import { JsonColumnInfo, Operator, ParsedJsonColumn } from './queryTypes'

export const isSetOperator = (opOrCondition: any): boolean => {
  const lower = opOrCondition.toLowerCase().trim()
  return lower === 'and' || lower === 'or'
}

export const isJsonPropertyText = (type: AttributeType): boolean =>
  type === AttributeType.STRING || type === AttributeType.EMAIL || type === AttributeType.URL

export const getParamName = (column: string, params: any): string => {
  let index = 1
  let value = params[`${column}_${index}`]

  while (value !== undefined) {
    index++
    value = params[`${column}_${index}`]
  }

  return `${column}_${index}`
}

export const getJsonParamName = (column: string, parts: string[], params: any): string => {
  let index = 1

  let key: string
  if (parts.length > 0) {
    key = `${column}_${parts.join('_')}`
  } else {
    key = column
  }

  let value = params[`${key}_${index}`]
  while (value !== undefined) {
    index++
    value = params[`${key}_${index}`]
  }

  return `${key}_${index}`
}

export const getOperator = (operator: Operator, json: boolean = false): string => {
  switch (operator) {
    case Operator.GREATER_THAN:
      return '>'
    case Operator.GREATER_THAN_OR_EQUAL:
      return '>='
    case Operator.LESS_THAN:
      return '<'
    case Operator.LESS_THAN_OR_EQUAL:
      return '<='
    case Operator.NOT_EQUAL:
    case Operator.NOT:
      return '<>'
    case Operator.EQUAL:
      return '='
    case Operator.LIKE:
    case Operator.TEXT_CONTAINS:
      return 'ilike'
    case Operator.NOT_LIKE:
    case Operator.NOT_TEXT_CONTAINS:
      return 'not ilike'
    case Operator.AND:
      return 'and'
    case Operator.OR:
      return 'or'
    case Operator.IN:
      return 'in'
    case Operator.NOT_IN:
      return 'not in'
    case Operator.BETWEEN:
      return 'between'
    case Operator.NOT_BETWEEN:
      return 'not between'
    case Operator.OVERLAP:
      if (json) {
        return '?|'
      }
      return '&&'
    case Operator.CONTAINS:
      if (json) {
        return '?&'
      }
      return '@>'

    default:
      throw new Error(`Unknown operator: ${operator}!`)
  }
}

export const getJsonColumnInfo = (
  column: string,
  jsonColumnInfos: JsonColumnInfo[],
): ParsedJsonColumn | undefined => {
  const parts = column.split('.')

  const actualProperty = parts[0]
  const info = singleOrDefault(
    jsonColumnInfos,
    (jsonColumnInfo) => jsonColumnInfo.property === actualProperty,
  )

  if (info) {
    return {
      info,
      parts,
    }
  }

  return undefined
}

export const parseJsonColumnCondition = (
  property: ParsedJsonColumn,
  filters: any,
  params: any,
): string => {
  const parts = property.parts.slice(1)

  let jsonColumn: string
  if (parts.length > 0) {
    const attribute = parts[0]
    const attributeInfo = singleOrDefault(property.info.attributeInfos, (a) => a.name === attribute)
    if (attributeInfo === undefined) {
      throw new Error(`Unknown ${property.info.property} attribute: ${attribute}!`)
    }

    const isText = isJsonPropertyText(attributeInfo.type)

    let nestedProperty = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      if (isText && i === parts.length - 1) {
        nestedProperty += ` ->> '${part}'`
      } else {
        nestedProperty += ` -> '${part}'`
      }
    }
    jsonColumn = `(${property.info.column}${nestedProperty})`

    if (attributeInfo.type === AttributeType.BOOLEAN) {
      jsonColumn = `${jsonColumn}::boolean`
    } else if (attributeInfo.type === AttributeType.NUMBER) {
      jsonColumn = `${jsonColumn}::integer`
    } else if (attributeInfo.type === AttributeType.DATE) {
      jsonColumn = `${jsonColumn}::timestamptz`
    }
  } else {
    jsonColumn = `(${property.info.column})`
  }

  let value
  let operator: Operator

  if (Array.isArray(filters)) {
    operator = Operator.CONTAINS
    value = filters
  } else {
    const conditionKeys = Object.keys(filters)
    if (conditionKeys.length !== 1) {
      throw new Error(`Invalid condition! ${JSON.stringify(filters, undefined, 2)}`)
    }

    operator = conditionKeys[0] as Operator
    value = filters[operator]
  }

  const actualOperator = getOperator(operator, true)

  if (operator === Operator.BETWEEN || operator === Operator.NOT_BETWEEN) {
    // we need two values
    const firstParamName = getJsonParamName(property.info.property, parts, params)
    params[firstParamName] = value[0]

    const secondParamName = getJsonParamName(property.info.property, parts, params)
    params[secondParamName] = value[1]

    return `(${jsonColumn} ${actualOperator} :${firstParamName} and :${secondParamName})`
  }
  if (operator === Operator.CONTAINS || operator === Operator.OVERLAP) {
    // we need an array of values
    const paramNames: string[] = []

    for (const val of value) {
      const paramName = getJsonParamName(property.info.property, parts, params)
      params[paramName] = val
      paramNames.push(`:${paramName}`)
    }

    const paramNamesString = paramNames.join(', ')
    return `(${jsonColumn} ${actualOperator} array[${paramNamesString}])`
  }
  if (operator === Operator.IN || operator === Operator.NOT_IN) {
    // we need a list of values
    const paramNames: string[] = []

    for (const val of value) {
      const paramName = getJsonParamName(property.info.property, parts, params)
      params[paramName] = val
      paramNames.push(`:${paramName}`)
    }

    const paramNamesString = paramNames.join(', ')
    return `(${jsonColumn} ${actualOperator} (${paramNamesString}))`
  }
  const paramName = getJsonParamName(property.info.property, parts, params)
  if (operator === Operator.LIKE || operator === Operator.NOT_LIKE) {
    params[paramName] = `%${value}%`
  } else {
    params[paramName] = value
  }

  return `(${jsonColumn} ${actualOperator} :${paramName})`
}

export const parseColumnCondition = (
  key: string,
  column: string,
  filters: any,
  params: any,
): string => {
  const conditionKeys = Object.keys(filters)
  if (conditionKeys.length !== 1) {
    throw new Error(`Invalid condition! ${JSON.stringify(filters, undefined, 2)}`)
  }

  const operator = conditionKeys[0] as Operator
  const actualOperator = getOperator(operator)
  const value = filters[operator]

  if (operator === Operator.BETWEEN || operator === Operator.NOT_BETWEEN) {
    // we need two values
    const firstParamName = getParamName(key, params)
    params[firstParamName] = value[0]

    const secondParamName = getParamName(key, params)
    params[secondParamName] = value[1]

    return `(${column} ${actualOperator} :${firstParamName} and :${secondParamName})`
  }
  if (operator === Operator.CONTAINS || operator === Operator.OVERLAP) {
    // we need an array of values
    const paramNames: string[] = []

    for (const val of value) {
      const paramName = getParamName(key, params)
      params[paramName] = val
      paramNames.push(`:${paramName}`)
    }

    const paramNamesString = paramNames.join(', ')
    return `(${column} ${actualOperator} array[${paramNamesString}])`
  }
  if (operator === Operator.IN || operator === Operator.NOT_IN) {
    // we need a list of values
    const paramNames: string[] = []

    for (const val of value) {
      const paramName = getParamName(key, params)
      params[paramName] = val
      paramNames.push(`:${paramName}`)
    }

    const paramNamesString = paramNames.join(', ')
    return `(${column} ${actualOperator} (${paramNamesString}))`
  }

  const paramName = getParamName(key, params)

  if (
    operator === Operator.EQUAL &&
    (value === null || (typeof value === 'string' && value.toLowerCase() === 'null'))
  ) {
    params[paramName] = null
    return `(${column} is :${paramName})`
  }

  if (
    operator === Operator.NOT_EQUAL &&
    (value === null || (typeof value === 'string' && value.toLowerCase() === 'null'))
  ) {
    params[paramName] = null
    return `(${column} is not :${paramName})`
  }

  if (
    operator === Operator.LIKE ||
    operator === Operator.NOT_LIKE ||
    operator === Operator.TEXT_CONTAINS ||
    operator === Operator.NOT_TEXT_CONTAINS
  ) {
    params[paramName] = `%${value}%`
  } else {
    params[paramName] = value
  }

  return `(${column} ${actualOperator} :${paramName})`
}
