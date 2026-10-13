export interface KpiSparkPoint {
  label: string;
  value: number;
}

export type KpiKey = 'revenue' | 'customers' | 'voucher' | 'frames';

export interface KpiCardData {
  key: KpiKey;
  title: string;
  value: string;
  changePct: number;
  changeLabel: string;
  trend: KpiSparkPoint[];
}

export interface SalesReportPoint {
  month: string;
  current: number;
  previous: number;
}

export interface SalesReport {
  total: number;
  delta: number;
  data: SalesReportPoint[];
}

export type OrderStatus = 'completed' | 'cancel' | 'error' | 'pending';

export interface RecentOrder {
  id: string;
  package: string;
  amount: number;
  date: string;
  status: OrderStatus;
}

export interface TopListItem {
  name: string;
  used: number;
  trend: 'up' | 'down';
}

export interface DashboardSummary {
  kpis: KpiCardData[];
  salesReport: SalesReport;
  recentOrders: RecentOrder[];
  topFrames: TopListItem[];
  topProducts: TopListItem[];
}

// Summary dashboard datang sebagai satu payload gabungan dari backend;
// field-nya snake_case mengikuti endpoint admin lain.
export type BackendKpiSparkPoint = {
  label: string;
  value: number;
};

export type BackendKpiCard = {
  key: KpiKey;
  title: string;
  value: string;
  change_pct: number;
  change_label: string;
  trend: BackendKpiSparkPoint[];
};

export type BackendSalesReportPoint = {
  month: string;
  current: number;
  previous: number;
};

export type BackendSalesReport = {
  total: number;
  delta: number;
  data: BackendSalesReportPoint[];
};

export type BackendRecentOrder = {
  id: string;
  package: string;
  amount: number;
  date: string;
  status: OrderStatus;
};

export type BackendTopListItem = {
  name: string;
  used: number;
  trend: 'up' | 'down';
};

export type BackendResponse = {
  kpis: BackendKpiCard[];
  sales_report: BackendSalesReport;
  recent_orders: BackendRecentOrder[];
  top_frames: BackendTopListItem[];
  top_products: BackendTopListItem[];
};

export const normalizeDashboardSummary = (
  data: BackendResponse,
): DashboardSummary => ({
  kpis: (data.kpis ?? []).map((kpi) => ({
    key: kpi.key,
    title: kpi.title,
    value: kpi.value,
    changePct: kpi.change_pct,
    changeLabel: kpi.change_label,
    trend: kpi.trend ?? [],
  })),
  salesReport: {
    total: data.sales_report?.total ?? 0,
    delta: data.sales_report?.delta ?? 0,
    data: data.sales_report?.data ?? [],
  },
  recentOrders: data.recent_orders ?? [],
  topFrames: data.top_frames ?? [],
  topProducts: data.top_products ?? [],
});
