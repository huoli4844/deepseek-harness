/** Synthetic chart scenarios: each role has its own topics, dimensions and series. */
import type { RoleId } from './model.ts'
import type { dashboardEn } from './dashboard-locales.ts'

/** Locale keys owned by the dashboard chart module. */
export type DashboardKey = keyof typeof dashboardEn
/** One chart dimension and its explicitly configured demonstration values. */
export interface ChartPoint {
  readonly label: DashboardKey
  readonly value: number
}
/** Paired series require a plan for every actual observation. */
export interface PlannedChartPoint extends ChartPoint {
  readonly target: number
}
/** Chart models preserve units and series semantics at the render site. */
export type DashboardChart = {
  readonly id: string
  readonly title: DashboardKey
  readonly taskIndex: 0 | 1 | 2
} & (
  | { readonly kind: 'distribution'; readonly points: readonly ChartPoint[] }
  | { readonly kind: 'comparison'; readonly points: readonly PlannedChartPoint[] }
  | { readonly kind: 'columns'; readonly points: readonly PlannedChartPoint[]; readonly unit?: 'money' }
  | { readonly kind: 'matrix'; readonly cells: readonly number[] }
)

/** Four additional charts per position, six for company and business management. */
export const dashboardCharts: Record<RoleId, readonly DashboardChart[]> = {
  procurement: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.procurement.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.procurement.distribution.0',
          value: 18,
        },
        {
          label: 'dashboard.procurement.distribution.1',
          value: 7,
        },
        {
          label: 'dashboard.procurement.distribution.2',
          value: 4,
        },
        {
          label: 'dashboard.procurement.distribution.3',
          value: 2,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.procurement.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.procurement.comparison.0',
          value: 74,
          target: 90,
        },
        {
          label: 'dashboard.procurement.comparison.1',
          value: 63,
          target: 85,
        },
        {
          label: 'dashboard.procurement.comparison.2',
          value: 89,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.procurement.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 9,
          target: 11,
        },
        {
          label: 'chart.week2',
          value: 12,
          target: 13,
        },
        {
          label: 'chart.week3',
          value: 10,
          target: 12,
        },
        {
          label: 'chart.week4',
          value: 15,
          target: 16,
        },
        {
          label: 'chart.week5',
          value: 13,
          target: 15,
        },
        {
          label: 'chart.week6',
          value: 17,
          target: 18,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.procurement.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  quality: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.quality.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.quality.distribution.0',
          value: 9,
        },
        {
          label: 'dashboard.quality.distribution.1',
          value: 6,
        },
        {
          label: 'dashboard.quality.distribution.2',
          value: 4,
        },
        {
          label: 'dashboard.quality.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.quality.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.quality.comparison.0',
          value: 83,
          target: 90,
        },
        {
          label: 'dashboard.quality.comparison.1',
          value: 67,
          target: 85,
        },
        {
          label: 'dashboard.quality.comparison.2',
          value: 42,
          target: 80,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.quality.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 8,
          target: 12,
        },
        {
          label: 'chart.week2',
          value: 11,
          target: 10,
        },
        {
          label: 'chart.week3',
          value: 9,
          target: 11,
        },
        {
          label: 'chart.week4',
          value: 13,
          target: 9,
        },
        {
          label: 'chart.week5',
          value: 12,
          target: 8,
        },
        {
          label: 'chart.week6',
          value: 16,
          target: 10,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.quality.matrix',
      taskIndex: 0,
      cells: [3, 3, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  director: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.director.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.director.distribution.0',
          value: 4,
        },
        {
          label: 'dashboard.director.distribution.1',
          value: 6,
        },
        {
          label: 'dashboard.director.distribution.2',
          value: 3,
        },
        {
          label: 'dashboard.director.distribution.3',
          value: 2,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.director.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.director.comparison.0',
          value: 78,
          target: 90,
        },
        {
          label: 'dashboard.director.comparison.1',
          value: 65,
          target: 80,
        },
        {
          label: 'dashboard.director.comparison.2',
          value: 88,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.director.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 7,
          target: 10,
        },
        {
          label: 'chart.week2',
          value: 9,
          target: 12,
        },
        {
          label: 'chart.week3',
          value: 12,
          target: 12,
        },
        {
          label: 'chart.week4',
          value: 11,
          target: 14,
        },
        {
          label: 'chart.week5',
          value: 15,
          target: 16,
        },
        {
          label: 'chart.week6',
          value: 18,
          target: 18,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.director.matrix',
      taskIndex: 0,
      cells: [3, 2, 2, 2, 3, 1, 1, 1, 0],
    },
  ],
  testing: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.testing.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.testing.distribution.0',
          value: 13,
        },
        {
          label: 'dashboard.testing.distribution.1',
          value: 7,
        },
        {
          label: 'dashboard.testing.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.testing.distribution.3',
          value: 4,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.testing.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.testing.comparison.0',
          value: 92,
          target: 95,
        },
        {
          label: 'dashboard.testing.comparison.1',
          value: 76,
          target: 90,
        },
        {
          label: 'dashboard.testing.comparison.2',
          value: 68,
          target: 85,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.testing.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 18,
          target: 22,
        },
        {
          label: 'chart.week2',
          value: 23,
          target: 25,
        },
        {
          label: 'chart.week3',
          value: 27,
          target: 28,
        },
        {
          label: 'chart.week4',
          value: 24,
          target: 30,
        },
        {
          label: 'chart.week5',
          value: 31,
          target: 32,
        },
        {
          label: 'chart.week6',
          value: 35,
          target: 36,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.testing.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  pilot: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.pilot.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.pilot.distribution.0',
          value: 11,
        },
        {
          label: 'dashboard.pilot.distribution.1',
          value: 4,
        },
        {
          label: 'dashboard.pilot.distribution.2',
          value: 3,
        },
        {
          label: 'dashboard.pilot.distribution.3',
          value: 2,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.pilot.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.pilot.comparison.0',
          value: 86,
          target: 95,
        },
        {
          label: 'dashboard.pilot.comparison.1',
          value: 78,
          target: 90,
        },
        {
          label: 'dashboard.pilot.comparison.2',
          value: 91,
          target: 100,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.pilot.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 8,
          target: 10,
        },
        {
          label: 'chart.week2',
          value: 10,
          target: 12,
        },
        {
          label: 'chart.week3',
          value: 13,
          target: 14,
        },
        {
          label: 'chart.week4',
          value: 12,
          target: 16,
        },
        {
          label: 'chart.week5',
          value: 16,
          target: 18,
        },
        {
          label: 'chart.week6',
          value: 17,
          target: 20,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.pilot.matrix',
      taskIndex: 0,
      cells: [3, 3, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  motor: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.motor.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.motor.distribution.0',
          value: 6,
        },
        {
          label: 'dashboard.motor.distribution.1',
          value: 4,
        },
        {
          label: 'dashboard.motor.distribution.2',
          value: 3,
        },
        {
          label: 'dashboard.motor.distribution.3',
          value: 5,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.motor.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.motor.comparison.0',
          value: 91,
          target: 95,
        },
        {
          label: 'dashboard.motor.comparison.1',
          value: 74,
          target: 90,
        },
        {
          label: 'dashboard.motor.comparison.2',
          value: 82,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.motor.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 7,
          target: 9,
        },
        {
          label: 'chart.week2',
          value: 9,
          target: 10,
        },
        {
          label: 'chart.week3',
          value: 11,
          target: 12,
        },
        {
          label: 'chart.week4',
          value: 10,
          target: 14,
        },
        {
          label: 'chart.week5',
          value: 14,
          target: 15,
        },
        {
          label: 'chart.week6',
          value: 16,
          target: 18,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.motor.matrix',
      taskIndex: 0,
      cells: [3, 2, 2, 2, 3, 1, 1, 1, 0],
    },
  ],
  marketing: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.marketing.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.marketing.distribution.0',
          value: 23,
        },
        {
          label: 'dashboard.marketing.distribution.1',
          value: 17,
        },
        {
          label: 'dashboard.marketing.distribution.2',
          value: 14,
        },
        {
          label: 'dashboard.marketing.distribution.3',
          value: 9,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.marketing.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.marketing.comparison.0',
          value: 32,
          target: 40,
        },
        {
          label: 'dashboard.marketing.comparison.1',
          value: 44,
          target: 50,
        },
        {
          label: 'dashboard.marketing.comparison.2',
          value: 24,
          target: 35,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.marketing.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 9,
          target: 12,
        },
        {
          label: 'chart.week2',
          value: 13,
          target: 15,
        },
        {
          label: 'chart.week3',
          value: 15,
          target: 16,
        },
        {
          label: 'chart.week4',
          value: 12,
          target: 18,
        },
        {
          label: 'chart.week5',
          value: 19,
          target: 20,
        },
        {
          label: 'chart.week6',
          value: 22,
          target: 24,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.marketing.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  sales: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.sales.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.sales.distribution.0',
          value: 12,
        },
        {
          label: 'dashboard.sales.distribution.1',
          value: 8,
        },
        {
          label: 'dashboard.sales.distribution.2',
          value: 6,
        },
        {
          label: 'dashboard.sales.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.sales.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.sales.comparison.0',
          value: 82,
          target: 95,
        },
        {
          label: 'dashboard.sales.comparison.1',
          value: 61,
          target: 85,
        },
        {
          label: 'dashboard.sales.comparison.2',
          value: 76,
          target: 90,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.sales.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 4,
          target: 6,
        },
        {
          label: 'chart.week2',
          value: 6,
          target: 7,
        },
        {
          label: 'chart.week3',
          value: 7,
          target: 8,
        },
        {
          label: 'chart.week4',
          value: 5,
          target: 8,
        },
        {
          label: 'chart.week5',
          value: 8,
          target: 9,
        },
        {
          label: 'chart.week6',
          value: 9,
          target: 11,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.sales.matrix',
      taskIndex: 0,
      cells: [3, 3, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  department: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.department.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.department.distribution.0',
          value: 8,
        },
        {
          label: 'dashboard.department.distribution.1',
          value: 11,
        },
        {
          label: 'dashboard.department.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.department.distribution.3',
          value: 4,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.department.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.department.comparison.0',
          value: 87,
          target: 95,
        },
        {
          label: 'dashboard.department.comparison.1',
          value: 76,
          target: 90,
        },
        {
          label: 'dashboard.department.comparison.2',
          value: 69,
          target: 85,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.department.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 6,
          target: 9,
        },
        {
          label: 'chart.week2',
          value: 8,
          target: 10,
        },
        {
          label: 'chart.week3',
          value: 10,
          target: 11,
        },
        {
          label: 'chart.week4',
          value: 9,
          target: 12,
        },
        {
          label: 'chart.week5',
          value: 13,
          target: 14,
        },
        {
          label: 'chart.week6',
          value: 14,
          target: 16,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.department.matrix',
      taskIndex: 0,
      cells: [3, 2, 2, 2, 3, 1, 1, 1, 0],
    },
  ],
  brake: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.brake.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.brake.distribution.0',
          value: 7,
        },
        {
          label: 'dashboard.brake.distribution.1',
          value: 5,
        },
        {
          label: 'dashboard.brake.distribution.2',
          value: 4,
        },
        {
          label: 'dashboard.brake.distribution.3',
          value: 6,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.brake.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.brake.comparison.0',
          value: 86,
          target: 95,
        },
        {
          label: 'dashboard.brake.comparison.1',
          value: 72,
          target: 90,
        },
        {
          label: 'dashboard.brake.comparison.2',
          value: 91,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.brake.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 5,
          target: 7,
        },
        {
          label: 'chart.week2',
          value: 7,
          target: 9,
        },
        {
          label: 'chart.week3',
          value: 9,
          target: 10,
        },
        {
          label: 'chart.week4',
          value: 8,
          target: 11,
        },
        {
          label: 'chart.week5',
          value: 11,
          target: 13,
        },
        {
          label: 'chart.week6',
          value: 13,
          target: 14,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.brake.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  hardware: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.hardware.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.hardware.distribution.0',
          value: 8,
        },
        {
          label: 'dashboard.hardware.distribution.1',
          value: 6,
        },
        {
          label: 'dashboard.hardware.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.hardware.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.hardware.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.hardware.comparison.0',
          value: 89,
          target: 95,
        },
        {
          label: 'dashboard.hardware.comparison.1',
          value: 72,
          target: 90,
        },
        {
          label: 'dashboard.hardware.comparison.2',
          value: 64,
          target: 85,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.hardware.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 8,
          target: 10,
        },
        {
          label: 'chart.week2',
          value: 10,
          target: 13,
        },
        {
          label: 'chart.week3',
          value: 13,
          target: 14,
        },
        {
          label: 'chart.week4',
          value: 11,
          target: 15,
        },
        {
          label: 'chart.week5',
          value: 16,
          target: 17,
        },
        {
          label: 'chart.week6',
          value: 18,
          target: 20,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.hardware.matrix',
      taskIndex: 0,
      cells: [3, 3, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  hr: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.hr.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.hr.distribution.0',
          value: 4,
        },
        {
          label: 'dashboard.hr.distribution.1',
          value: 7,
        },
        {
          label: 'dashboard.hr.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.hr.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.hr.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.hr.comparison.0',
          value: 79,
          target: 90,
        },
        {
          label: 'dashboard.hr.comparison.1',
          value: 86,
          target: 95,
        },
        {
          label: 'dashboard.hr.comparison.2',
          value: 58,
          target: 80,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.hr.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 5,
          target: 7,
        },
        {
          label: 'chart.week2',
          value: 7,
          target: 8,
        },
        {
          label: 'chart.week3',
          value: 8,
          target: 10,
        },
        {
          label: 'chart.week4',
          value: 7,
          target: 10,
        },
        {
          label: 'chart.week5',
          value: 10,
          target: 12,
        },
        {
          label: 'chart.week6',
          value: 12,
          target: 14,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.hr.matrix',
      taskIndex: 0,
      cells: [3, 2, 2, 2, 3, 1, 1, 1, 0],
    },
  ],
  firmware: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.firmware.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.firmware.distribution.0',
          value: 9,
        },
        {
          label: 'dashboard.firmware.distribution.1',
          value: 6,
        },
        {
          label: 'dashboard.firmware.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.firmware.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.firmware.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.firmware.comparison.0',
          value: 91,
          target: 95,
        },
        {
          label: 'dashboard.firmware.comparison.1',
          value: 78,
          target: 90,
        },
        {
          label: 'dashboard.firmware.comparison.2',
          value: 83,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.firmware.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 12,
          target: 17,
        },
        {
          label: 'chart.week2',
          value: 15,
          target: 18,
        },
        {
          label: 'chart.week3',
          value: 18,
          target: 16,
        },
        {
          label: 'chart.week4',
          value: 16,
          target: 19,
        },
        {
          label: 'chart.week5',
          value: 22,
          target: 18,
        },
        {
          label: 'chart.week6',
          value: 25,
          target: 20,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.firmware.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  operator: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.operator.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.operator.distribution.0',
          value: 5,
        },
        {
          label: 'dashboard.operator.distribution.1',
          value: 13,
        },
        {
          label: 'dashboard.operator.distribution.2',
          value: 7,
        },
        {
          label: 'dashboard.operator.distribution.3',
          value: 4,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.operator.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.operator.comparison.0',
          value: 93,
          target: 98,
        },
        {
          label: 'dashboard.operator.comparison.1',
          value: 89,
          target: 95,
        },
        {
          label: 'dashboard.operator.comparison.2',
          value: 96,
          target: 100,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.operator.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 15,
          target: 18,
        },
        {
          label: 'chart.week2',
          value: 18,
          target: 20,
        },
        {
          label: 'chart.week3',
          value: 21,
          target: 22,
        },
        {
          label: 'chart.week4',
          value: 20,
          target: 24,
        },
        {
          label: 'chart.week5',
          value: 24,
          target: 26,
        },
        {
          label: 'chart.week6',
          value: 27,
          target: 28,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.operator.matrix',
      taskIndex: 0,
      cells: [3, 3, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  equipment: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.equipment.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.equipment.distribution.0',
          value: 5,
        },
        {
          label: 'dashboard.equipment.distribution.1',
          value: 4,
        },
        {
          label: 'dashboard.equipment.distribution.2',
          value: 3,
        },
        {
          label: 'dashboard.equipment.distribution.3',
          value: 2,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.equipment.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.equipment.comparison.0',
          value: 82,
          target: 95,
        },
        {
          label: 'dashboard.equipment.comparison.1',
          value: 88,
          target: 95,
        },
        {
          label: 'dashboard.equipment.comparison.2',
          value: 91,
          target: 100,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.equipment.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 7,
          target: 9,
        },
        {
          label: 'chart.week2',
          value: 9,
          target: 10,
        },
        {
          label: 'chart.week3',
          value: 10,
          target: 12,
        },
        {
          label: 'chart.week4',
          value: 9,
          target: 12,
        },
        {
          label: 'chart.week5',
          value: 12,
          target: 14,
        },
        {
          label: 'chart.week6',
          value: 14,
          target: 15,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.equipment.matrix',
      taskIndex: 0,
      cells: [3, 2, 2, 2, 3, 1, 1, 1, 0],
    },
  ],
  assurance: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.assurance.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.assurance.distribution.0',
          value: 11,
        },
        {
          label: 'dashboard.assurance.distribution.1',
          value: 8,
        },
        {
          label: 'dashboard.assurance.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.assurance.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.assurance.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.assurance.comparison.0',
          value: 92,
          target: 95,
        },
        {
          label: 'dashboard.assurance.comparison.1',
          value: 84,
          target: 90,
        },
        {
          label: 'dashboard.assurance.comparison.2',
          value: 76,
          target: 90,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.assurance.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 8,
          target: 12,
        },
        {
          label: 'chart.week2',
          value: 11,
          target: 13,
        },
        {
          label: 'chart.week3',
          value: 12,
          target: 11,
        },
        {
          label: 'chart.week4',
          value: 10,
          target: 12,
        },
        {
          label: 'chart.week5',
          value: 15,
          target: 10,
        },
        {
          label: 'chart.week6',
          value: 17,
          target: 13,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.assurance.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
  ],
  president: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.president.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.president.distribution.0',
          value: 4,
        },
        {
          label: 'dashboard.president.distribution.1',
          value: 7,
        },
        {
          label: 'dashboard.president.distribution.2',
          value: 5,
        },
        {
          label: 'dashboard.president.distribution.3',
          value: 3,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.president.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.president.comparison.0',
          value: 83,
          target: 95,
        },
        {
          label: 'dashboard.president.comparison.1',
          value: 74,
          target: 90,
        },
        {
          label: 'dashboard.president.comparison.2',
          value: 86,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.president.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 5,
          target: 8,
        },
        {
          label: 'chart.week2',
          value: 7,
          target: 9,
        },
        {
          label: 'chart.week3',
          value: 9,
          target: 10,
        },
        {
          label: 'chart.week4',
          value: 8,
          target: 11,
        },
        {
          label: 'chart.week5',
          value: 12,
          target: 13,
        },
        {
          label: 'chart.week6',
          value: 13,
          target: 15,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.president.matrix',
      taskIndex: 0,
      cells: [3, 3, 1, 2, 3, 1, 1, 1, 0],
    },
    {
      id: 'cash',
      kind: 'columns',
      title: 'dashboard.president.cash',
      taskIndex: 2,
      unit: 'money',
      points: [
        {
          label: 'chart.week1',
          value: 42,
          target: 50,
        },
        {
          label: 'chart.week2',
          value: 57,
          target: 60,
        },
        {
          label: 'chart.week3',
          value: 61,
          target: 70,
        },
        {
          label: 'chart.week4',
          value: 54,
          target: 65,
        },
        {
          label: 'chart.week5',
          value: 73,
          target: 85,
        },
        {
          label: 'chart.week6',
          value: 82,
          target: 95,
        },
      ],
    },
    {
      id: 'resources',
      kind: 'comparison',
      title: 'dashboard.president.resources',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.president.resources.0',
          value: 78,
          target: 90,
        },
        {
          label: 'dashboard.president.resources.1',
          value: 86,
          target: 95,
        },
        {
          label: 'dashboard.president.resources.2',
          value: 72,
          target: 90,
        },
        {
          label: 'dashboard.president.resources.3',
          value: 79,
          target: 90,
        },
      ],
    },
  ],
  project: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.project.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.project.distribution.0',
          value: 3,
        },
        {
          label: 'dashboard.project.distribution.1',
          value: 8,
        },
        {
          label: 'dashboard.project.distribution.2',
          value: 6,
        },
        {
          label: 'dashboard.project.distribution.3',
          value: 4,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.project.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.project.comparison.0',
          value: 84,
          target: 90,
        },
        {
          label: 'dashboard.project.comparison.1',
          value: 72,
          target: 85,
        },
        {
          label: 'dashboard.project.comparison.2',
          value: 63,
          target: 80,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.project.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 4,
          target: 6,
        },
        {
          label: 'chart.week2',
          value: 6,
          target: 7,
        },
        {
          label: 'chart.week3',
          value: 7,
          target: 9,
        },
        {
          label: 'chart.week4',
          value: 6,
          target: 8,
        },
        {
          label: 'chart.week5',
          value: 9,
          target: 11,
        },
        {
          label: 'chart.week6',
          value: 11,
          target: 12,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.project.matrix',
      taskIndex: 0,
      cells: [3, 2, 2, 2, 3, 1, 1, 1, 0],
    },
  ],
  executive: [
    {
      id: 'distribution',
      kind: 'distribution',
      title: 'dashboard.executive.distribution',
      taskIndex: 0,
      points: [
        {
          label: 'dashboard.executive.distribution.0',
          value: 9,
        },
        {
          label: 'dashboard.executive.distribution.1',
          value: 12,
        },
        {
          label: 'dashboard.executive.distribution.2',
          value: 8,
        },
        {
          label: 'dashboard.executive.distribution.3',
          value: 5,
        },
      ],
    },
    {
      id: 'comparison',
      kind: 'comparison',
      title: 'dashboard.executive.comparison',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.executive.comparison.0',
          value: 81,
          target: 95,
        },
        {
          label: 'dashboard.executive.comparison.1',
          value: 73,
          target: 90,
        },
        {
          label: 'dashboard.executive.comparison.2',
          value: 84,
          target: 95,
        },
      ],
    },
    {
      id: 'columns',
      kind: 'columns',
      title: 'dashboard.executive.columns',
      taskIndex: 2,
      points: [
        {
          label: 'chart.week1',
          value: 6,
          target: 9,
        },
        {
          label: 'chart.week2',
          value: 9,
          target: 11,
        },
        {
          label: 'chart.week3',
          value: 11,
          target: 12,
        },
        {
          label: 'chart.week4',
          value: 10,
          target: 14,
        },
        {
          label: 'chart.week5',
          value: 14,
          target: 16,
        },
        {
          label: 'chart.week6',
          value: 16,
          target: 18,
        },
      ],
    },
    {
      id: 'matrix',
      kind: 'matrix',
      title: 'dashboard.executive.matrix',
      taskIndex: 0,
      cells: [4, 2, 1, 2, 3, 1, 1, 1, 0],
    },
    {
      id: 'cash',
      kind: 'columns',
      title: 'dashboard.executive.cash',
      taskIndex: 2,
      unit: 'money',
      points: [
        {
          label: 'chart.week1',
          value: 42,
          target: 50,
        },
        {
          label: 'chart.week2',
          value: 57,
          target: 60,
        },
        {
          label: 'chart.week3',
          value: 61,
          target: 70,
        },
        {
          label: 'chart.week4',
          value: 54,
          target: 65,
        },
        {
          label: 'chart.week5',
          value: 73,
          target: 85,
        },
        {
          label: 'chart.week6',
          value: 82,
          target: 95,
        },
      ],
    },
    {
      id: 'resources',
      kind: 'comparison',
      title: 'dashboard.executive.resources',
      taskIndex: 1,
      points: [
        {
          label: 'dashboard.executive.resources.0',
          value: 78,
          target: 90,
        },
        {
          label: 'dashboard.executive.resources.1',
          value: 86,
          target: 95,
        },
        {
          label: 'dashboard.executive.resources.2',
          value: 72,
          target: 90,
        },
        {
          label: 'dashboard.executive.resources.3',
          value: 79,
          target: 90,
        },
      ],
    },
  ],
}
