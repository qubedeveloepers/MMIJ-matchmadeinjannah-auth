import { Transform } from 'class-transformer';
import { IsOptional, IsInt, IsObject, Min, Max } from 'class-validator';
import { parseFilter, parseSort } from 'src/utils/filter.utils';

export class QueryDto {
  @IsOptional()
  @Transform(({ value }) => parseSort(value))
  @IsObject()
  orderby?: Record<string, any> = { createdAt: -1 };

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 100;

  @IsOptional()
  @Transform(({ value }) => parseFilter(value))
  @IsObject()
  filter?: Record<string, any> = {};
}
