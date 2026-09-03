import { BadRequestException } from '@nestjs/common';
import { createFilter } from '@steedos/odata-v4-mongodb';

function replaceInClause(criteria) {
  for (const [id, value] of Object.entries(criteria)) {
    if (typeof value === 'object' && value !== null) {
      replaceInClause(value);
    } else if (value !== null && typeof value === 'string') {
      if (value.startsWith('$in(') && value.endsWith(')')) {
        const values = value.substring(4, value.length - 1).split(',');
        criteria[id] = {
          $in: values.map((v) => {
            if (
              (v.startsWith('"') && v.endsWith('"')) ||
              (v.startsWith("'") && v.endsWith("'"))
            ) {
              return v.substring(1, v.length - 1);
            } else {
              return v.trim();
            }
          }),
        };
      }
    }
  }
}

export function parseFilter(filter: string) {
  if (!filter) {
    return {};
  }
  try {
    const criteria = createFilter(filter.trim());
    replaceInClause(criteria);
    return criteria;
  } catch (error) {
    throw new BadRequestException('Bad filter: ' + error.message);
  }
}

export function parseSort(orderby: string) {
  const sort = {};
  orderby?.split(',').forEach((field) => {
    const [key, value] = field.split(' ');
    sort[key.replace(/\//g, '.')] = value === 'desc' ? -1 : 1;
  });
  return sort;
}
