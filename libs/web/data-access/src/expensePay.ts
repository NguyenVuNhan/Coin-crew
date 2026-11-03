import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExpensePayNoRow, ExpensePayView, PaidBy } from '@cc/core';
import { apiFetch, apiSend } from './client';

export type ExpensePayResponse = ExpensePayView | ExpensePayNoRow;

export interface ReportExpensePaymentBody {
  amount: number;
  paidBy: PaidBy;
}

export interface ReportExpensePaymentResult {
  paymentId: string;
  status: string;
}

export function useExpensePay(tripId: string, expenseId: string, version: number) {
  return useQuery<ExpensePayResponse>({
    queryKey: ['expense-pay', tripId, expenseId, version],
    queryFn: () =>
      apiFetch<ExpensePayResponse>(`/api/trips/${tripId}/expenses/${expenseId}/pay`, { tripId }),
    enabled: Boolean(tripId && expenseId),
  });
}

export function useReportExpensePayment(tripId: string, expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation<ReportExpensePaymentResult, Error, ReportExpensePaymentBody>({
    mutationFn: (body) =>
      apiSend<ReportExpensePaymentResult>(
        `/api/trips/${tripId}/expenses/${expenseId}/pay-report`,
        'POST',
        body,
        tripId,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expense-pay', tripId, expenseId] }),
        queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
      ]);
    },
  });
}
