export type TableDensity = 'compact' | 'comfortable';

type TableDensityMetrics = {
  rowHeight: number;
  headerHeight: number;
};

const TABLE_DENSITY_METRICS: Record<TableDensity, TableDensityMetrics> = {
  compact: {
    rowHeight: 25,
    headerHeight: 27,
  },
  comfortable: {
    rowHeight: 36,
    headerHeight: 29,
  },
};

export function getTableDensityMetrics(
  density: TableDensity = 'compact',
): TableDensityMetrics {
  return TABLE_DENSITY_METRICS[density];
}
