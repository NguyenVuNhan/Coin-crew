// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SportBillTable } from '../components/SportBillTable';
import { ExpenseRow } from '../components/ExpenseRow';
import { ExpenseDetails } from '../components/ExpenseDetails';
import {
  ExpenseForm,
  calculateSlotsDuration,
  extractRecentStartTimes,
  parseStartAndDuration,
  formatTimeRange,
  formatSlotsRange,
} from '../screens/ExpenseForm';
import { AppNav } from '../components/AppNav';
import * as qrUtil from '@cc/web-util/qr';
import type { ExpenseView, TripView } from '@cc/core';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const planningExpense: ExpenseView = {
  id: 'e-1',
  description: 'Cầu lông sáng CN',
  amount: 0,
  spentOn: '2026-11-08',
  payerId: 'p-1',
  mode: 'amounts',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: 'p-1',
  shares: [
    { participantId: 'p-1', amount: 0, inputValue: 0 },
    { participantId: 'p-2', amount: 0, inputValue: 0 },
  ],
  meta: {
    sport: {
      planning: true,
      location: {
        name: 'Sân Putin',
        address: '158 Phú Diễn',
        phone: '0912345678',
        mapUrl: 'https://maps.google.com/?q=Putin',
      },
      courtSlots: [{ courtName: 'Sân 6', timeRange: '5h-7h' }],
      bookingCode: 'BK-4139',
      totalDuration: '2h',
      bookingImageDataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
      court: 168000,
      shuttlecocks: [],
      extra: 0,
      rule: { kind: 'equal' },
      entries: [
        { participantId: 'p-1', femaleSlots: 7, maleSlots: 0 },
        { participantId: 'p-2', femaleSlots: 0, maleSlots: 12 },
      ],
      maleSlotRate: 0,
      femaleSlotRate: 0,
    },
  },
};

const planningTripView: TripView = {
  trip: {
    id: 't-1',
    name: '5AM',
    currency: 'VND',
    preset: 'sport',
    fewestTransfers: true,
    archived: false,
    version: 1,
    total: 0,
  },
  me: {
    kind: 'member',
    participantId: 'p-1',
    participantPending: false,
    isOrganiser: true,
    isAdmin: true,
  },
  people: [
    { id: 'p-1', name: 'Thủy', status: 'active', isMember: true, isOrganiser: true, bank: 'approved', gender: 'F' },
    { id: 'p-2', name: 'Quang', status: 'active', isMember: true, isOrganiser: false, bank: 'none', gender: 'M' },
  ],
  expenses: [planningExpense],
  payments: [],
  balances: { 'p-1': 0, 'p-2': 0 },
  suggestions: [],
  myBalance: null,
  approvals: [],
  links: { group: 'gtok-1', view: 'vtok-1' },
  locations: [
    {
      id: 'loc-1',
      name: 'Sân Putin',
      address: '158 Phú Diễn',
      phone: '0912345678',
      mapUrl: 'https://maps.google.com/?q=Putin',
      notes: null,
    },
  ],
  aiBookingExtract: true,
};

describe('Sport Planning UI components', () => {
  it('renders SportBillTable in 3-column planning mode without money columns or cost rows', () => {
    render(
      <SportBillTable
        planning
        total={0}
        meId="p-1"
        calc={{
          court: 168000,
          shuttlecocksTotal: 0,
          extra: 0,
          maleSlotRate: 0,
          femaleSlotRate: 0,
          totalFemaleSlots: 7,
          totalMaleSlots: 12,
          participants: [
            { participantId: 'p-1', name: 'Thủy Nguyễn', rosterGender: 'F', femaleSlots: 1, maleSlots: 0, fixedAmount: null, amount: 0 },
            { participantId: 'p-2', name: 'Quang', rosterGender: 'M', femaleSlots: 0, maleSlots: 1, fixedAmount: null, amount: 0 },
          ],
        }}
      />,
    );

    expect(screen.getByText('Thủy Nguyễn (you)')).toBeTruthy();
    expect(screen.queryByText(/AMOUNT|THÀNH TIỀN/i)).toBeNull();
    expect(screen.queryByText(/COSTS|CHI PHÍ/i)).toBeNull();
    expect(screen.queryByText(/PER SLOT|MỖI SUẤT/i)).toBeNull();
  });

  it('renders ExpenseRow with Planning pill and slot count instead of VND amount', () => {
    render(
      <MemoryRouter>
        <ExpenseRow expense={planningExpense} view={planningTripView} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Cầu lông sáng CN')).toBeTruthy();
    expect(screen.getByText(/Sân Putin/)).toBeTruthy();
    expect(screen.getByText(/Planning|Lên lịch/i)).toBeTruthy();
    expect(screen.getAllByText(/19/).length).toBeGreaterThan(0);
  });

  it('opens 2-option menu when clicking + in AppNav with planHref', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AppNav section="groups" addHref="/t/t-1/expenses/new" planHref="/t/t-1/expenses/new?mode=planning" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const addButtons = screen.getAllByTestId('nav-add');
    fireEvent.click(addButtons[0]!);
    expect(screen.getAllByText(/Plan session|Lên lịch buổi chơi/i).length).toBeGreaterThan(0);
  });

  it('renders ExpenseDetails in planning mode with 3-column table, venue facts, share button, and completion action for admins', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/e-1']}>
          <Routes>
            <Route
              path="/t/:tripId/expenses/:expenseId"
              element={<ExpenseDetails view={planningTripView} expenseId="e-1" onClose={() => {}} />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Cầu lông sáng CN')).toBeTruthy();
    expect(screen.getByText(/Planning|Lên lịch/i)).toBeTruthy();
    expect(screen.getByText('Sân Putin')).toBeTruthy();
    expect(screen.getByText(/158 Phú Diễn/)).toBeTruthy();
    expect(screen.getByText(/Open map|Mở bản đồ/i)).toBeTruthy();
    expect(screen.getByText(/Sân 6 \(5h-7h\)/)).toBeTruthy();
    expect(screen.queryByText(/AMOUNT|THÀNH TIỀN/i)).toBeNull();
    expect(screen.getByText(/Share schedule & headcount|Chia sẻ lịch & danh sách/i)).toBeTruthy();
    expect(screen.getByText(/Include booking image|Gửi kèm ảnh đặt sân/i)).toBeTruthy();
    expect(screen.getByText(/Complete & split bill|Hoàn tất & chia tiền/i)).toBeTruthy();
  });

  it('renders ExpenseForm in planning mode (?mode=planning) with venue/court fields and saves with amount 0 and planning: true', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/api/trips/t-1/expenses')) {
          posted.push(JSON.parse(String(init.body)));
          return Response.json({ expenseId: 'e-new-plan' }, { status: 201 });
        }
        return Response.json(planningTripView);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/new?mode=planning']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
            <Route path="/t/:tripId/expenses/:expenseId" element={<div>Details page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/What for|Khoản chi gì/i)).toBeTruthy());
    // Should hide shuttlecocks & extra fee in planning mode
    expect(screen.queryByText(/Add shuttlecock|Thêm giá cầu/i)).toBeNull();
    // Should show AI extract trigger when view.aiBookingExtract is true
    expect(screen.getByText(/Auto-fill from booking image|Đọc từ ảnh đặt sân/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/What for|Khoản chi gì/i), {
      target: { value: 'Cầu lông tối T3' },
    });

    const saveBtn = screen.getByRole('button', { name: /Save planned session|Lưu lịch dự kiến/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      description: 'Cầu lông tối T3',
      amount: 0,
      mode: 'amounts',
      meta: {
        sport: {
          planning: true,
        },
      },
    });
  });

  it('renders ExpenseForm in completion mode (?mode=complete) with pre-filled court cost and submits planning: false', async () => {
    const patched: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PATCH' && url.endsWith('/api/trips/t-1/expenses/e-1')) {
          patched.push(JSON.parse(String(init.body)));
          return Response.json({ expenseId: 'e-2' });
        }
        return Response.json(planningTripView);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/e-1/edit?mode=complete']}>
          <Routes>
            <Route path="/t/:tripId/expenses/:expenseId/edit" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/^(Court|Tiền sân)$/i)).toBeTruthy());
    // Shuttlecock button should be visible now in complete mode
    expect(screen.getByText(/\+ Add shuttlecock price|\+ Thêm giá cầu/i)).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /Save|Lưu/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toMatchObject({
      description: 'Cầu lông sáng CN',
      amount: 168000,
      meta: {
        sport: {
          planning: false,
          court: 168000,
          location: {
            name: 'Sân Putin',
            address: '158 Phú Diễn',
          },
          courtSlots: [{ courtName: 'Sân 6', timeRange: '5h-7h' }],
        },
      },
    });
  });

  it('auto-fills form fields from { extracted } on booking screenshot upload and saves new venue via { location }', async () => {
    vi.spyOn(qrUtil, 'compressBookingImage').mockResolvedValue('data:image/webp;base64,AAAA');
    const postedLocations: unknown[] = [];
    const postedExpenses: unknown[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/api/trips/t-1/sport-booking/extract')) {
          return Response.json({
            extracted: {
              clubName: 'Sân Mới Cầu Giấy',
              address: '99 Cầu Giấy',
              phone: '0988888888',
              date: '2026-11-10',
              bookingCode: 'BK-99',
              totalDuration: '2h',
              totalAmount: 200000,
              courtSlots: [{ courtName: 'Sân 1', timeRange: '18h-20h' }],
            },
          });
        }
        if (init?.method === 'POST' && url.endsWith('/api/trips/t-1/locations')) {
          postedLocations.push(JSON.parse(String(init.body)));
          return Response.json(
            {
              location: {
                id: 'loc-new',
                name: 'Sân Mới Cầu Giấy',
                address: '99 Cầu Giấy',
                phone: '0988888888',
                mapUrl: null,
                notes: null,
              },
            },
            { status: 201 },
          );
        }
        if (init?.method === 'POST' && url.endsWith('/api/trips/t-1/expenses')) {
          postedExpenses.push(JSON.parse(String(init.body)));
          return Response.json({ expenseId: 'e-new-plan-2' }, { status: 201 });
        }
        return Response.json(planningTripView);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/new?mode=planning']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
            <Route path="/t/:tripId/expenses/:expenseId" element={<div>Details page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/What for|Khoản chi gì/i)).toBeTruthy());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const fakeFile = new File(['img'], 'booking.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() =>
      expect((screen.getByLabelText(/Venue name|Tên sân/i) as HTMLInputElement).value).toBe('Sân Mới Cầu Giấy'),
    );
    expect((screen.getByLabelText(/Address|Địa chỉ/i) as HTMLInputElement).value).toBe('99 Cầu Giấy');
    expect((screen.getByLabelText(/Booking code|Mã đặt sân/i) as HTMLInputElement).value).toBe('BK-99');
    expect((container.querySelector('[data-testid="entry-date-overlay-value"]') as HTMLInputElement).value).toBe('2026-11-10');

    fireEvent.change(screen.getByLabelText(/What for|Khoản chi gì/i), {
      target: { value: 'Cầu lông tối T3' },
    });

    const saveBtn = screen.getByRole('button', { name: /Save planned session|Lưu lịch dự kiến/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(postedExpenses).toHaveLength(1));
    expect(postedLocations).toHaveLength(1);
    expect(postedExpenses[0]).toMatchObject({
      description: 'Cầu lông tối T3',
      amount: 0,
      spentOn: '2026-11-10',
      meta: {
        sport: {
          planning: true,
          bookingCode: 'BK-99',
          totalDuration: '2h',
          court: 200000,
          courtSlots: [{ courtName: 'Sân 1', timeRange: '18h-20h' }],
          location: {
            locationId: 'loc-new',
            name: 'Sân Mới Cầu Giấy',
            address: '99 Cầu Giấy',
            phone: '0988888888',
          },
        },
      },
    });
  });

  it('blocks non-admin members from opening ?mode=planning', async () => {
    const nonAdminView: TripView = {
      ...planningTripView,
      me: {
        kind: 'member',
        participantId: 'p-2',
        participantPending: false,
        isOrganiser: false,
        isAdmin: false,
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(nonAdminView)));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/new?mode=planning']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Only the person who added|Chỉ người thêm/i)).toBeTruthy());
  });

  describe('calculateSlotsDuration', () => {
    it('returns null for empty or invalid slots', () => {
      expect(calculateSlotsDuration([])).toBeNull();
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '' }])).toBeNull();
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: 'invalid' }])).toBeNull();
    });

    it('calculates duration for single slot format (05:00 - 07:00)', () => {
      expect(calculateSlotsDuration([{ courtName: 'Sân 6', timeRange: '05:00 - 07:00' }])).toBe('2h');
    });

    it('calculates duration for single slot format (5h00 - 7h00)', () => {
      expect(calculateSlotsDuration([{ courtName: 'Sân 6', timeRange: '5h00 - 7h00' }])).toBe('2h');
    });

    it('calculates duration across multiple overlapping or consecutive slots', () => {
      expect(
        calculateSlotsDuration([
          { courtName: 'Sân 6', timeRange: '5h00 - 7h00' },
          { courtName: 'Sân 5', timeRange: '5h30 - 7h00' },
        ]),
      ).toBe('2h');
    });

    it('calculates duration with minutes (e.g. 18h - 20h30)', () => {
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '18h - 20h30' }])).toBe('2h30p');
    });

    it('keeps overnight multi-court sessions on the same night', () => {
      const slots = [
        { courtName: 'Sân 1', timeRange: '23:00 - 01:00' },
        { courtName: 'Sân 2', timeRange: '00:00 - 02:00' },
      ];
      expect(calculateSlotsDuration(slots)).toBe('3h');
      expect(formatSlotsRange(slots)).toBe('23:00 – 02:00');
    });

    it('handles "to" separator, identical start/end times, and sub-1-hour durations', () => {
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '05:00 to 07:00' }])).toBe('2h');
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '18:00 - 18:00' }])).toBeNull();
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '08:00 - 08:45' }])).toBe('45p');
    });
  });

  it('prefills time range from previous slot when clicking add court slot in ExpenseForm', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(planningTripView)));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/new?mode=planning']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /\+ Add court|\+ Thêm sân/i })).toBeTruthy());

    const addCourtBtn = screen.getByRole('button', { name: /\+ Add court|\+ Thêm sân/i });
    fireEvent.click(addCourtBtn);

    const timeInputs = container.querySelectorAll<HTMLInputElement>('input[type="time"]');
    expect(timeInputs.length).toBe(1);
    fireEvent.change(timeInputs[0]!, { target: { value: '18:00' } });

    fireEvent.click(addCourtBtn);

    const updatedTimeInputs = container.querySelectorAll<HTMLInputElement>('input[type="time"]');
    expect(updatedTimeInputs.length).toBe(2);
    expect(updatedTimeInputs[1]!.value).toBe('18:00');
  });

  it('renders auto calculated total duration banner and removes manual duration input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(planningTripView)));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/new?mode=planning']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /\+ Add court|\+ Thêm sân/i })).toBeTruthy());

    // Manual input is removed
    expect(document.getElementById('sport-total-duration')).toBeNull();

    const addCourtBtn = screen.getByRole('button', { name: /\+ Add court|\+ Thêm sân/i });
    fireEvent.click(addCourtBtn);

    // Auto duration banner appears
    await waitFor(() => {
      const banner = document.querySelector('.fsl-sport-duration-banner');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/2h|2 giờ/);
    });
  });

  it('renders decoupled booking code and duration fact rows in ExpenseDetails', () => {
    const expenseOnlyBookingCode: ExpenseView = {
      ...planningExpense,
      meta: {
        ...planningExpense.meta,
        sport: {
          ...planningExpense.meta!.sport!,
          bookingCode: '#4139',
          totalDuration: null,
        },
      },
    };
    const tripWithOnlyBookingCode: TripView = {
      ...planningTripView,
      expenses: [expenseOnlyBookingCode],
    };

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/e-1']}>
          <Routes>
            <Route
              path="/t/:tripId/expenses/:expenseId"
              element={<ExpenseDetails view={tripWithOnlyBookingCode} expenseId="e-1" onClose={() => {}} />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('#4139')).toBeTruthy();
    expect(screen.getByText(/Booking code|Mã đặt sân/i)).toBeTruthy();
    expect(screen.queryByText(/Duration|Thời lượng/i)).toBeNull();

    const expenseOnlyDuration: ExpenseView = {
      ...planningExpense,
      meta: {
        ...planningExpense.meta,
        sport: {
          ...planningExpense.meta!.sport!,
          bookingCode: null,
          totalDuration: '3h',
        },
      },
    };
    const tripWithOnlyDuration: TripView = {
      ...planningTripView,
      expenses: [expenseOnlyDuration],
    };

    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/e-1']}>
          <Routes>
            <Route
              path="/t/:tripId/expenses/:expenseId"
              element={<ExpenseDetails view={tripWithOnlyDuration} expenseId="e-1" onClose={() => {}} />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('3h')).toBeTruthy();
    expect(screen.getByText(/Duration|Thời lượng/i)).toBeTruthy();
    expect(screen.queryByText('#4139')).toBeNull();
  });

  describe('Time & Duration utilities', () => {
    it('extracts unique recent start times from expenses up to maxCount', () => {
      const e1: ExpenseView = {
        ...planningExpense,
        id: 'e-recent-1',
        spentOn: '2026-11-09',
        meta: { sport: { courtSlots: [{ courtName: 'Sân 1', timeRange: '18:00 - 20:00' }] } } as any,
      };
      const e2: ExpenseView = {
        ...planningExpense,
        id: 'e-recent-2',
        spentOn: '2026-11-08',
        meta: { sport: { courtSlots: [{ courtName: 'Sân 2', timeRange: '19:30 - 21:30' }] } } as any,
      };
      const e3: ExpenseView = {
        ...planningExpense,
        id: 'e-recent-3',
        spentOn: '2026-11-07',
        meta: { sport: { courtSlots: [{ courtName: 'Sân 3', timeRange: '18:00 - 20:00' }] } } as any,
      };
      const e4: ExpenseView = {
        ...planningExpense,
        id: 'e-recent-4',
        spentOn: '2026-11-06',
        meta: { sport: { courtSlots: [{ courtName: 'Sân 4', timeRange: '05:30 - 07:30' }] } } as any,
      };
      const result = extractRecentStartTimes([e4, e2, e1, e3], 3);
      expect(result).toEqual(['18:00', '19:30', '05:30']);
    });

    it('returns empty array when expenses have no court slots', () => {
      expect(extractRecentStartTimes([])).toEqual([]);
      expect(extractRecentStartTimes([{ ...planningExpense, meta: null }])).toEqual([]);
    });

    it('parses start time and duration correctly', () => {
      expect(parseStartAndDuration('18:00 - 20:00')).toEqual({ startTime: '18:00', durationHours: 2 });
      expect(parseStartAndDuration('05:30 - 07:00')).toEqual({ startTime: '05:30', durationHours: 1.5 });
      expect(parseStartAndDuration('23:00 - 01:00')).toEqual({ startTime: '23:00', durationHours: 2 });
      expect(parseStartAndDuration('invalid')).toBeNull();
    });

    it('formats time range given start time and duration hours', () => {
      expect(formatTimeRange('18:00', 2)).toBe('18:00 - 20:00');
      expect(formatTimeRange('05:30', 1.5)).toBe('05:30 - 07:00');
      expect(formatTimeRange('23:00', 2)).toBe('23:00 - 01:00');
    });

    it('calculates duration across single and multiple court slots', () => {
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '18:00 - 20:00' }])).toBe('2h');
      expect(
        calculateSlotsDuration([
          { courtName: 'Sân 1', timeRange: '18:00 - 20:00' },
          { courtName: 'Sân 2', timeRange: '18:00 - 20:00' },
        ]),
      ).toBe('2h');
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '05:30 - 07:00' }])).toBe('1h30p');
      expect(calculateSlotsDuration([{ courtName: 'Sân 1', timeRange: '23:00 - 01:00' }])).toBe('2h');
    });

    it('renders schedule card with recent start time chips, custom time input, duration stepper and auto duration banner', async () => {
      const postedExpenses: any[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (init?.method === 'POST' && url.endsWith('/api/trips/t-1/expenses')) {
            postedExpenses.push(JSON.parse(String(init.body)));
            return Response.json({ expenseId: 'e-new-plan-auto-dur' }, { status: 201 });
          }
          return Response.json(planningTripView);
        }),
      );

      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/t/t-1/expenses/new?mode=planning']}>
            <Routes>
              <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => expect(screen.getByText(/\+ Add court slot|\+ Thêm sân đấu/i)).toBeTruthy());

      // Standalone manual input#sport-total-duration should NOT exist
      expect(document.getElementById('sport-total-duration')).toBeNull();

      // Click + Add court slot
      const addCourtBtn = screen.getByText(/\+ Add court slot|\+ Thêm sân đấu/i);
      fireEvent.click(addCourtBtn);

      // Verify recent start time chip from planningTripView (planningExpense has '5h-7h' -> start '05:00')
      await waitFor(() => expect(screen.getByRole('button', { name: '05:00' })).toBeTruthy());

      // Verify native time input exists
      const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
      expect(timeInput).toBeTruthy();
      expect(timeInput.value).toBe('05:00');

      // Duration pills should exist (1h, 1.5h, 2h, 2.5h, 3h)
      const dur2hBtn = screen.getByRole('button', { name: '2h' });
      expect(dur2hBtn).toBeTruthy();

      // Live duration banner should be visible
      const banner = document.querySelector('.fsl-sport-duration-banner');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/2h|2 giờ/i);

      // Change time via native input
      fireEvent.change(timeInput, { target: { value: '18:00' } });
      expect(timeInput.value).toBe('18:00');

      // Change duration to 1.5h
      const dur15Btn = screen.getByRole('button', { name: '1.5h' });
      fireEvent.click(dur15Btn);

      // Verify banner updates to 1h30p
      expect(banner?.textContent).toMatch(/1h30p/i);
    });
  });
});
