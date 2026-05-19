import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const MAX_EVENT_DOTS_IN_CELL = 4;
const STORAGE_KEY = 'uplog-events';
const CATEGORY_STORAGE_KEY = 'uplog-categories';
const CALENDAR_STORAGE_KEY = 'uplog-calendars';
const CALENDAR_FILTER_STORAGE_KEY = 'uplog-calendar-filters';
const ROUTINE_STORAGE_KEY = 'uplog-routines';
const GIRLFRIEND_CALENDAR_ID = 'calendar-girlfriend';
const FAMILY_CALENDAR_ID = 'calendar-family';
const DEFAULT_CALENDAR_ID = 'calendar-me';

type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
};

type EventCalendarType = 'solar' | 'lunar';
type EventRepeatType = 'none' | 'lunar-yearly';

type Event = {
  id: string;
  title: string;
  date: string;
  color: string;
  memo?: string;
  calendarType: EventCalendarType;
  repeatType: EventRepeatType;
  lunarMonth?: number;
  lunarDay?: number;
  categoryId?: string;
  calendarId?: string;
};

type Category = {
  id: string;
  name: string;
  color: string;
  calendarId?: string;
};

type CalendarSpace = {
  id: string;
  name: string;
};

type LunarDate = {
  month: number;
  day: number;
};

type MainView = 'calendar' | 'routine';

type Routine = {
  id: string;
  title: string;
  calendarId: string;
  categoryId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  memo?: string;
  enabled: boolean;
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  events: Event[];
  categories?: Category[];
  calendars?: CalendarSpace[];
  routines?: Routine[];
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createMonthGrid = (baseDate: Date): CalendarDay[] => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const today = new Date();
  const cells: CalendarDay[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    cells.push({
      date,
      inCurrentMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
    });
  }

  return cells;
};

const formatDateKorean = (date: Date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;

const formatSelectedDate = (date: Date) => `${formatDateKorean(date)} ${WEEKDAY_NAMES[date.getDay()]}`;

const chineseLunarFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('ko-KR-u-ca-chinese', {
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return null;
  }
})();

const getLunarDate = (date: Date): LunarDate | null => {
  if (!chineseLunarFormatter) {
    return null;
  }

  const parts = chineseLunarFormatter.formatToParts(date);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { month, day };
};

const getLunarDateText = (date: Date, withLabel = false): string => {
  const lunarDate = getLunarDate(date);
  if (!lunarDate) {
    return '';
  }

  if (withLabel) {
    return `음력 ${lunarDate.month}월 ${lunarDate.day}일`;
  }

  return `${lunarDate.month}.${lunarDate.day}`;
};

const normalizeEvent = (item: unknown): Event | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const raw = item as Partial<Event>;

  if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.date !== 'string' || typeof raw.color !== 'string') {
    return null;
  }

  const calendarType: EventCalendarType = raw.calendarType === 'lunar' ? 'lunar' : 'solar';
  const repeatType: EventRepeatType = raw.repeatType === 'lunar-yearly' ? 'lunar-yearly' : 'none';
  const memo = typeof raw.memo === 'string' ? raw.memo : undefined;
  const lunarMonth = typeof raw.lunarMonth === 'number' ? raw.lunarMonth : undefined;
  const lunarDay = typeof raw.lunarDay === 'number' ? raw.lunarDay : undefined;
  const categoryId = typeof raw.categoryId === 'string' ? raw.categoryId : undefined;
  const calendarId = typeof raw.calendarId === 'string' ? raw.calendarId : undefined;

  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    color: raw.color,
    memo,
    calendarType,
    repeatType,
    lunarMonth,
    lunarDay,
    categoryId,
    calendarId,
  };
};

const normalizeCategory = (item: unknown): Category | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const raw = item as Partial<Category>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.color !== 'string') {
    return null;
  }
  const calendarId = typeof raw.calendarId === 'string' ? raw.calendarId : undefined;
  return { id: raw.id, name: raw.name, color: raw.color, calendarId };
};

const normalizeCalendar = (item: unknown): CalendarSpace | null => {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Partial<CalendarSpace>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  return { id: raw.id, name: raw.name };
};

const normalizeRoutine = (item: unknown): Routine | null => {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Partial<Routine>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.calendarId !== 'string' ||
    typeof raw.categoryId !== 'string' ||
    !Array.isArray(raw.daysOfWeek) ||
    typeof raw.startTime !== 'string' ||
    typeof raw.endTime !== 'string' ||
    typeof raw.enabled !== 'boolean'
  ) {
    return null;
  }
  const daysOfWeek = raw.daysOfWeek.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6);
  if (daysOfWeek.length === 0) return null;
  return {
    id: raw.id,
    title: raw.title,
    calendarId: raw.calendarId,
    categoryId: raw.categoryId,
    daysOfWeek,
    startTime: raw.startTime,
    endTime: raw.endTime,
    memo: typeof raw.memo === 'string' ? raw.memo : undefined,
    enabled: raw.enabled,
  };
};

const DEFAULT_CALENDARS: CalendarSpace[] = [
  { id: DEFAULT_CALENDAR_ID, name: '내 캘린더' },
  { id: GIRLFRIEND_CALENDAR_ID, name: '여자친구' },
  { id: FAMILY_CALENDAR_ID, name: '가족' },
];

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'default-me-personal', name: '개인', color: '#3b82f6', calendarId: DEFAULT_CALENDAR_ID },
  { id: 'default-me-work', name: '업무', color: '#8b5cf6', calendarId: DEFAULT_CALENDAR_ID },
  { id: 'default-me-health', name: '건강', color: '#0ea5a4', calendarId: DEFAULT_CALENDAR_ID },
  { id: 'default-me-etc', name: '기타', color: '#64748b', calendarId: DEFAULT_CALENDAR_ID },
  { id: 'default-gf-date', name: '데이트', color: '#ec4899', calendarId: GIRLFRIEND_CALENDAR_ID },
  { id: 'default-gf-anniversary', name: '기념일', color: '#f97316', calendarId: GIRLFRIEND_CALENDAR_ID },
  { id: 'default-gf-travel', name: '여행', color: '#06b6d4', calendarId: GIRLFRIEND_CALENDAR_ID },
  { id: 'default-gf-gift', name: '선물', color: '#eab308', calendarId: GIRLFRIEND_CALENDAR_ID },
  { id: 'default-gf-etc', name: '기타', color: '#64748b', calendarId: GIRLFRIEND_CALENDAR_ID },
  { id: 'default-family-hospital', name: '병원', color: '#ef4444', calendarId: FAMILY_CALENDAR_ID },
  { id: 'default-family-event', name: '가족행사', color: '#22c55e', calendarId: FAMILY_CALENDAR_ID },
  { id: 'default-family-home', name: '집안일', color: '#f59e0b', calendarId: FAMILY_CALENDAR_ID },
  { id: 'default-family-etc', name: '기타', color: '#64748b', calendarId: FAMILY_CALENDAR_ID },
];


const DEFAULT_CATEGORIES_BY_CALENDAR = DEFAULT_CATEGORIES.reduce<Record<string, Category[]>>((acc, category) => {
  const calendarId = category.calendarId ?? DEFAULT_CALENDAR_ID;
  if (!acc[calendarId]) {
    acc[calendarId] = [];
  }
  acc[calendarId].push(category);
  return acc;
}, {});

const getDefaultCategoryIdForCalendar = (calendarId: string) => {
  const categories = DEFAULT_CATEGORIES_BY_CALENDAR[calendarId] ?? DEFAULT_CATEGORIES_BY_CALENDAR[DEFAULT_CALENDAR_ID] ?? [];
  return categories.find((category) => category.name === '기타')?.id ?? categories[0]?.id ?? DEFAULT_CATEGORIES[0].id;
};

const ensureCalendarDefaultCategories = (source: Category[], calendars: CalendarSpace[]) => {
  const next = [...source];
  calendars.forEach((calendar) => {
    const defaults = DEFAULT_CATEGORIES_BY_CALENDAR[calendar.id] ?? [];
    if (defaults.length === 0) return;
    const existing = next.filter((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === calendar.id);
    if (existing.length === 0) {
      next.push(...defaults.map((category) => ({ ...category })));
    }
  });
  return next;
};

const buildInitialEvents = (now: Date): Event[] => {
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const laterInMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 3, 28));
  const anotherDay = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 7, 28));

  return [
    {
      id: 'event-1',
      title: '오늘 회고 정리',
      date: formatDateKey(todayDate),
      color: '#3b82f6',
      calendarType: 'solar',
      repeatType: 'none',
      calendarId: DEFAULT_CALENDAR_ID,
    },
    {
      id: 'event-2',
      title: '팀 주간 미팅',
      date: formatDateKey(laterInMonth),
      color: '#8b5cf6',
      calendarType: 'solar',
      repeatType: 'none',
      calendarId: DEFAULT_CALENDAR_ID,
    },
    {
      id: 'event-3',
      title: '운동 기록 점검',
      date: formatDateKey(anotherDay),
      color: '#0ea5a4',
      calendarType: 'solar',
      repeatType: 'none',
      calendarId: DEFAULT_CALENDAR_ID,
    },
  ];
};

function App() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventMemo, setNewEventMemo] = useState('');
  const [newEventType, setNewEventType] = useState<EventRepeatType>('none');
  const [newEventCategoryId, setNewEventCategoryId] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState('');
  const [editingEventMemo, setEditingEventMemo] = useState('');
  const [editingEventType, setEditingEventType] = useState<EventRepeatType>('none');
  const [editingEventCategoryId, setEditingEventCategoryId] = useState('');
  const [activeMenuEventId, setActiveMenuEventId] = useState<string | null>(null);
  const [activeMenuCategoryId, setActiveMenuCategoryId] = useState<string | null>(null);
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const actionMenuAreaRef = useRef<HTMLUListElement>(null);
  const categoryMenuAreaRef = useRef<HTMLUListElement>(null);

  const initialEvents = useMemo<Event[]>(() => buildInitialEvents(today), [today]);

  const [events, setEvents] = useState<Event[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialEvents;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return initialEvents;
      }

      const normalized = parsed.map(normalizeEvent).filter((item): item is Event => item !== null);
      return normalized.length > 0 ? normalized : initialEvents;
    } catch {
      return initialEvents;
    }
  });
  const [categories, setCategories] = useState<Category[]>(() => {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
      const normalized = parsed.map(normalizeCategory).filter((item): item is Category => item !== null);
      return normalized.length > 0 ? normalized : DEFAULT_CATEGORIES;
    } catch {
      return DEFAULT_CATEGORIES;
    }
  });
  const [calendars, setCalendars] = useState<CalendarSpace[]>(() => {
    const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (!raw) return DEFAULT_CALENDARS;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_CALENDARS;
      const normalized = parsed.map(normalizeCalendar).filter((item): item is CalendarSpace => item !== null);
      return normalized.length > 0 ? normalized : DEFAULT_CALENDARS;
    } catch {
      return DEFAULT_CALENDARS;
    }
  });
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(() => {
    const raw = localStorage.getItem(CALENDAR_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_CALENDARS.map((calendar) => calendar.id);
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_CALENDARS.map((calendar) => calendar.id);
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return DEFAULT_CALENDARS.map((calendar) => calendar.id);
    }
  });
  const [editingCategoryCalendarId, setEditingCategoryCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [newEventCalendarId, setNewEventCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [editingEventCalendarId, setEditingEventCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [mainView, setMainView] = useState<MainView>('calendar');
  const [routines, setRoutines] = useState<Routine[]>(() => {
    const raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeRoutine).filter((item): item is Routine => item !== null);
    } catch {
      return [];
    }
  });
  const [isRoutineFormOpen, setIsRoutineFormOpen] = useState(false);
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineCalendarId, setRoutineCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [routineCategoryId, setRoutineCategoryId] = useState(getDefaultCategoryIdForCalendar(DEFAULT_CALENDAR_ID));
  const [routineStartTime, setRoutineStartTime] = useState('09:00');
  const [routineEndTime, setRoutineEndTime] = useState('10:00');
  const [routineMemo, setRoutineMemo] = useState('');
  const [routineDaysOfWeek, setRoutineDaysOfWeek] = useState<number[]>([]);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [routineFeedback, setRoutineFeedback] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);
  useEffect(() => {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
  }, [categories]);
  useEffect(() => {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(calendars));
  }, [calendars]);
  useEffect(() => {
    localStorage.setItem(CALENDAR_FILTER_STORAGE_KEY, JSON.stringify(selectedCalendarIds));
  }, [selectedCalendarIds]);
  useEffect(() => {
    localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(routines));
  }, [routines]);
  useEffect(() => {
    if (!routineFeedback) return;
    const timeout = window.setTimeout(() => setRoutineFeedback(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [routineFeedback]);
  useEffect(() => {
    if (!calendars.some((calendar) => calendar.id === editingCategoryCalendarId)) {
      setEditingCategoryCalendarId(calendars[0]?.id ?? DEFAULT_CALENDAR_ID);
    }
  }, [calendars, editingCategoryCalendarId]);

  const categoryById = useMemo(() => {
    return categories.reduce<Record<string, Category>>((acc, category) => {
      acc[category.id] = category;
      return acc;
    }, {});
  }, [categories]);

  const calendarById = useMemo(() => calendars.reduce<Record<string, CalendarSpace>>((acc, calendar) => {
    acc[calendar.id] = calendar;
    return acc;
  }, {}), [calendars]);

  const getEventColor = (event: Event) => categoryById[event.categoryId ?? '']?.color ?? event.color;

  const categoryByColor = useMemo(() => {
    return DEFAULT_CATEGORIES.reduce<Record<string, string>>((acc, category) => {
      acc[category.color.toLowerCase()] = category.id;
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    setCategories((prev) => ensureCalendarDefaultCategories(
      prev.map((category) => ({ ...category, calendarId: category.calendarId ?? DEFAULT_CALENDAR_ID })),
      calendars,
    ));
  }, [calendars]);

  useEffect(() => {
    setEvents((prev) =>
      prev.map((event) => {
        const eventCalendarId = event.calendarId ?? DEFAULT_CALENDAR_ID;
        if (event.categoryId && categoryById[event.categoryId]) {
          return event.calendarId ? event : { ...event, calendarId: eventCalendarId };
        }
        const migratedCategoryId = categoryByColor[event.color.toLowerCase()] ?? getDefaultCategoryIdForCalendar(eventCalendarId);
        return { ...event, categoryId: migratedCategoryId, calendarId: eventCalendarId };
      }),
    );
  }, [categoryByColor, categoryById]);

  const handleAddCategory = () => {
    const name = window.prompt('새 카테고리 이름을 입력해 주세요.');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const color = window.prompt('카테고리 색상(#RRGGBB)을 입력해 주세요.', '#64748b')?.trim() || '#64748b';
    setCategories((prev) => [...prev, { id: `category-${Date.now()}`, name: trimmed, color, calendarId: editingCategoryCalendarId }]);
  };

  const handleRenameCategory = (category: Category) => {
    const name = window.prompt('카테고리 이름 수정', category.name);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => prev.map((item) => (item.id === category.id ? { ...item, name: trimmed } : item)));
  };

  const handleRecolorCategory = (category: Category) => {
    const color = window.prompt('카테고리 색상 수정(#RRGGBB)', category.color)?.trim();
    if (!color) return;
    setCategories((prev) => prev.map((item) => (item.id === category.id ? { ...item, color } : item)));
  };

  const handleDeleteCategory = (category: Category) => {
    if (category.name === '기타') { window.alert('기타 카테고리는 삭제할 수 없습니다.'); return; }
    const usedCount = events.filter((event) => event.categoryId === category.id).length;
    const message = usedCount > 0
      ? '이 카테고리를 사용하는 일정은 기타로 이동됩니다. 삭제할까요?'
      : '이 카테고리를 삭제할까요?';
    if (!window.confirm(message)) return;
    setEvents((prev) => prev.map((event) => (event.categoryId === category.id ? { ...event, categoryId: getDefaultCategoryIdForCalendar(event.calendarId ?? DEFAULT_CALENDAR_ID) } : event)));
    setCategories((prev) => prev.filter((item) => item.id !== category.id));
  };
  const toggleCalendarFilter = (calendarId: string) => {
    setSelectedCalendarIds((prev) => {
      if (prev.includes(calendarId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== calendarId);
      }
      return [...prev, calendarId];
    });
  };


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!actionMenuAreaRef.current?.contains(e.target as Node)) {
        setActiveMenuEventId(null);
      }
      if (!categoryMenuAreaRef.current?.contains(e.target as Node)) {
        setActiveMenuCategoryId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const monthCells = useMemo(() => createMonthGrid(currentMonth), [currentMonth]);

  const filteredEvents = useMemo(
    () => events.filter((event) => selectedCalendarIds.includes(event.calendarId ?? DEFAULT_CALENDAR_ID)),
    [events, selectedCalendarIds],
  );

  const eventsByDate = useMemo(() => {
    const solarEventsMap = filteredEvents.reduce<Record<string, Event[]>>((acc, event) => {
      if (event.repeatType !== 'lunar-yearly') {
        if (!acc[event.date]) {
          acc[event.date] = [];
        }
        acc[event.date].push(event);
      }
      return acc;
    }, {});

    const lunarRepeatEvents = filteredEvents.filter((event) => event.repeatType === 'lunar-yearly');

    if (lunarRepeatEvents.length === 0) {
      return monthCells.reduce<Record<string, Event[]>>((acc, cell) => {
        const dateKey = formatDateKey(cell.date);
        const solarEvents = solarEventsMap[dateKey];
        if (solarEvents?.length) {
          acc[dateKey] = solarEvents;
        }
        return acc;
      }, {});
    }

    return monthCells.reduce<Record<string, Event[]>>((acc, cell) => {
      const dateKey = formatDateKey(cell.date);
      const solarEvents = solarEventsMap[dateKey] ?? [];
      const lunarDate = getLunarDate(cell.date);
      const lunarEvents = lunarDate
        ? lunarRepeatEvents.filter((event) => event.lunarMonth === lunarDate.month && event.lunarDay === lunarDate.day)
        : [];
      const mergedEvents = solarEvents.length > 0 ? [...solarEvents, ...lunarEvents] : lunarEvents;

      if (mergedEvents.length > 0) {
        acc[dateKey] = mergedEvents;
      }

      return acc;
    }, {});
  }, [filteredEvents, monthCells]);

  const monthTitle = `${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월`;
  const selectedDateEvents = eventsByDate[formatDateKey(selectedDate)] ?? [];
  const addFormCategories = useMemo(() => categories.filter((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === newEventCalendarId), [categories, newEventCalendarId]);
  const editFormCategories = useMemo(() => categories.filter((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === editingEventCalendarId), [categories, editingEventCalendarId]);
  const categoryManagementCategories = useMemo(
    () => categories.filter((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === editingCategoryCalendarId),
    [categories, editingCategoryCalendarId],
  );
  const selectedLunarText = getLunarDateText(selectedDate, true);
  const selectedLunarDate = getLunarDate(selectedDate);
  const canAddLunarRepeat = selectedLunarDate !== null;
  const routineFormCategories = useMemo(
    () => categories.filter((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === routineCalendarId),
    [categories, routineCalendarId],
  );
  const sortedRoutines = useMemo(() => [...routines].sort((a, b) => a.startTime.localeCompare(b.startTime)), [routines]);

  const goPrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  const openAddForm = () => {
    setNewEventTitle('');
    setNewEventType('none');
    setNewEventMemo('');
    setNewEventCalendarId(DEFAULT_CALENDAR_ID);
    setNewEventCategoryId(getDefaultCategoryIdForCalendar(DEFAULT_CALENDAR_ID));
    setIsAddFormOpen(true);
  };

  const closeAddForm = () => {
    setIsAddFormOpen(false);
    setNewEventTitle('');
    setNewEventMemo('');
  };

  const handleAddEvent = (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newEventTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    if (newEventType === 'lunar-yearly' && !selectedLunarDate) {
      return;
    }

    const trimmedMemo = newEventMemo.trim();

    const createdEvent: Event = {
      id: `event-${Date.now()}`,
      title: trimmedTitle,
      date: formatDateKey(selectedDate),
      color: categoryById[newEventCategoryId]?.color ?? DEFAULT_CATEGORIES[0].color,
      memo: trimmedMemo || undefined,
      calendarType: newEventType === 'lunar-yearly' ? 'lunar' : 'solar',
      repeatType: newEventType,
      lunarMonth: newEventType === 'lunar-yearly' ? selectedLunarDate?.month : undefined,
      lunarDay: newEventType === 'lunar-yearly' ? selectedLunarDate?.day : undefined,
      categoryId: newEventCategoryId,
      calendarId: newEventCalendarId,
    };

    setEvents((prev) => [...prev, createdEvent]);
    closeAddForm();
  };


  const handleExportBackup = () => {
    const backupData: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      events,
      categories,
      calendars,
      routines,
    };

    const jsonText = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const todayKey = formatDateKey(new Date());

    anchor.href = url;
    anchor.download = `uplog-backup-${todayKey}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleClickRestoreButton = () => {
    restoreInputRef.current?.click();
  };

  const handleImportBackup = async (e: FormEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const file = target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<BackupPayload>;
      const eventsSource = Array.isArray(parsed) ? parsed : parsed.events;

      if (!eventsSource || !Array.isArray(eventsSource)) {
        window.alert('백업 파일 형식이 올바르지 않습니다. events 배열이 필요합니다.');
        target.value = '';
        return;
      }

      const normalizedEvents = eventsSource.map(normalizeEvent).filter((item): item is Event => item !== null);

      if (normalizedEvents.length !== eventsSource.length) {
        window.alert('일부 일정 데이터 형식이 올바르지 않아 복원할 수 없습니다.');
        target.value = '';
        return;
      }

      const categorySource = Array.isArray(parsed) ? undefined : parsed.categories;
      const calendarSource = Array.isArray(parsed) ? undefined : parsed.calendars;
      const routineSource = Array.isArray(parsed) ? undefined : parsed.routines;
      const normalizedCategories = Array.isArray(categorySource)
        ? categorySource.map(normalizeCategory).filter((item): item is Category => item !== null)
        : null;
      const normalizedCalendars = Array.isArray(calendarSource)
        ? calendarSource.map(normalizeCalendar).filter((item): item is CalendarSpace => item !== null)
        : null;
      const normalizedRoutines = Array.isArray(routineSource)
        ? routineSource.map(normalizeRoutine).filter((item): item is Routine => item !== null)
        : null;

      const shouldRestore = window.confirm('백업을 가져오면 현재 일정이 백업 내용으로 덮어써집니다. 복원할까요?');
      if (!shouldRestore) {
        target.value = '';
        return;
      }

      setEvents(normalizedEvents);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedEvents));
      const nextCategories = normalizedCategories && normalizedCategories.length > 0 ? normalizedCategories : DEFAULT_CATEGORIES;
      setCategories(nextCategories);
      localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(nextCategories));
      const nextCalendars = normalizedCalendars && normalizedCalendars.length > 0 ? normalizedCalendars : DEFAULT_CALENDARS;
      setCalendars(nextCalendars);
      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(nextCalendars));
      const nextRoutines = normalizedRoutines ?? [];
      setRoutines(nextRoutines);
      localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(nextRoutines));
      window.alert('백업 가져오기가 완료되었습니다.');
    } catch {
      window.alert('백업 파일을 읽을 수 없습니다. JSON 파일인지 확인해 주세요.');
    } finally {
      target.value = '';
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    setActiveMenuEventId(null);
    setPendingDeleteEventId(eventId);
  };

  const closeDeleteModal = () => {
    setPendingDeleteEventId(null);
  };

  const confirmDeleteEvent = () => {
    if (!pendingDeleteEventId) {
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== pendingDeleteEventId));
    closeDeleteModal();
  };

  const startEditEvent = (event: Event) => {
    setActiveMenuEventId(null);
    setIsAddFormOpen(false);
    setEditingEventId(event.id);
    setEditingEventTitle(event.title);
    setEditingEventMemo(event.memo ?? '');
    setEditingEventType(event.repeatType);
    setEditingEventCategoryId(event.categoryId ?? getDefaultCategoryIdForCalendar(event.calendarId ?? DEFAULT_CALENDAR_ID));
    setEditingEventCalendarId(event.calendarId ?? DEFAULT_CALENDAR_ID);
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEditingEventTitle('');
    setEditingEventMemo('');
    setEditingEventType('none');
    setEditingEventCategoryId('');
    setEditingEventCalendarId(DEFAULT_CALENDAR_ID);
  };

  const handleEditEvent = (e: FormEvent, baseEvent: Event) => {
    e.preventDefault();
    const trimmedTitle = editingEventTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    if (editingEventType === 'lunar-yearly' && !selectedLunarDate) {
      return;
    }

    const trimmedMemo = editingEventMemo.trim();

    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== baseEvent.id) {
          return event;
        }

        return {
          ...event,
          title: trimmedTitle,
          color: categoryById[editingEventCategoryId]?.color ?? event.color,
          memo: trimmedMemo || undefined,
          calendarType: editingEventType === 'lunar-yearly' ? 'lunar' : 'solar',
          repeatType: editingEventType,
          lunarMonth: editingEventType === 'lunar-yearly' ? selectedLunarDate?.month ?? event.lunarMonth : undefined,
          lunarDay: editingEventType === 'lunar-yearly' ? selectedLunarDate?.day ?? event.lunarDay : undefined,
          categoryId: editingEventCategoryId,
          calendarId: editingEventCalendarId,
        };
      }),
    );
    cancelEditEvent();
  };

  const toggleRoutineDay = (day: number) => {
    setRoutineDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day].sort((a, b) => a - b)));
  };

  const openRoutineForm = () => {
    setEditingRoutineId(null);
    setRoutineTitle('');
    setRoutineCalendarId(DEFAULT_CALENDAR_ID);
    setRoutineCategoryId(getDefaultCategoryIdForCalendar(DEFAULT_CALENDAR_ID));
    setRoutineStartTime('09:00');
    setRoutineEndTime('10:00');
    setRoutineMemo('');
    setRoutineDaysOfWeek([]);
    setIsRoutineFormOpen(true);
  };

  const closeRoutineForm = () => setIsRoutineFormOpen(false);

  const handleAddRoutine = (e: FormEvent) => {
    e.preventDefault();
    if (!routineTitle.trim() || routineDaysOfWeek.length === 0) return;
    const nextRoutine: Routine = {
      id: editingRoutineId ?? `routine-${Date.now()}`,
      title: routineTitle.trim(),
      calendarId: routineCalendarId,
      categoryId: routineCategoryId,
      daysOfWeek: routineDaysOfWeek,
      startTime: routineStartTime,
      endTime: routineEndTime,
      memo: routineMemo.trim() || undefined,
      enabled: true,
    };
    if (editingRoutineId) {
      setRoutines((prev) => prev.map((routine) => (routine.id === editingRoutineId ? { ...nextRoutine, enabled: routine.enabled } : routine)));
      setRoutineFeedback('루틴이 수정되었습니다.');
    } else {
      setRoutines((prev) => [...prev, nextRoutine]);
      setRoutineFeedback('루틴이 저장되었습니다.');
    }
    closeRoutineForm();
  };

  const handleEditRoutine = (routine: Routine) => {
    setEditingRoutineId(routine.id);
    setRoutineTitle(routine.title);
    setRoutineCalendarId(routine.calendarId);
    setRoutineCategoryId(routine.categoryId);
    setRoutineStartTime(routine.startTime);
    setRoutineEndTime(routine.endTime);
    setRoutineMemo(routine.memo ?? '');
    setRoutineDaysOfWeek(routine.daysOfWeek);
    setIsRoutineFormOpen(true);
  };

  const handleDeleteRoutine = (routineId: string) => {
    setRoutines((prev) => prev.filter((routine) => routine.id !== routineId));
    setRoutineFeedback('루틴이 삭제되었습니다.');
  };

  const handleToggleRoutineEnabled = (routineId: string) => {
    setRoutines((prev) => prev.map((routine) => (routine.id === routineId ? { ...routine, enabled: !routine.enabled } : routine)));
    setRoutineFeedback('루틴 상태가 변경되었습니다.');
  };

  return (
    <div className="app-shell">
      <header className="calendar-header">
        <div className="brand-block">
          <h1>UpLog</h1>
          <p className="brand-subtitle">{mainView === 'calendar' ? 'Monthly Calendar' : 'Weekly Routine Board'}</p>
        </div>
        <div className="top-view-tabs" role="tablist" aria-label="메인 화면 전환">
          <button type="button" role="tab" aria-selected={mainView === 'calendar'} className={`view-tab ${mainView === 'calendar' ? 'active' : ''}`} onClick={() => setMainView('calendar')}>캘린더</button>
          <button type="button" role="tab" aria-selected={mainView === 'routine'} className={`view-tab ${mainView === 'routine' ? 'active' : ''}`} onClick={() => setMainView('routine')}>루틴</button>
        </div>
        {mainView === 'calendar' ? (
        <div className="month-controls" aria-label="월 이동 컨트롤">
          <button type="button" onClick={goPrevMonth} aria-label="이전 달" className="icon-button">◀</button>
          <p className="month-title" aria-live="polite" aria-label="현재 표시 중인 월">{monthTitle}</p>
          <button type="button" onClick={goNextMonth} aria-label="다음 달" className="icon-button">▶</button>
          <button type="button" onClick={goToday} className="today-button">오늘</button>
        </div>
        ) : <div />}
      </header>
      {mainView === 'calendar' ? (
      <main className="calendar-layout" aria-label="월간 캘린더와 선택 날짜 요약">
        <aside className="category-side-panel" aria-label="카테고리 관리 패널">
          <section className="panel-subsection">
            <h2 className="category-panel-title">캘린더 공간</h2>
          <ul className="calendar-filter-list">
            {calendars.map((calendar) => (
              <li key={calendar.id} className="calendar-filter-item">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(calendar.id)}
                    onChange={() => toggleCalendarFilter(calendar.id)}
                  />
                  <span>{calendar.name}</span>
                </label>
              </li>
            ))}
          </ul>
          </section>

          <section className="panel-subsection">
            <h2 className="category-panel-title">카테고리 관리</h2>
          <label htmlFor="category-edit-calendar-select" className="form-label">편집할 캘린더</label>
          <select
            id="category-edit-calendar-select"
            className="form-input category-edit-calendar-select"
            value={editingCategoryCalendarId}
            onChange={(event) => setEditingCategoryCalendarId(event.target.value)}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
          <ul className="category-list" ref={categoryMenuAreaRef}>
            {categoryManagementCategories.map((category) => (
              <li key={category.id} className="category-item">
                <span className="panel-event-dot" style={{ backgroundColor: category.color }} aria-hidden="true" />
                <span className="category-name">{category.name}</span>
                <div className="panel-event-actions">
                  <button
                    type="button"
                    className="panel-action-menu-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMenuCategoryId((prev) => (prev === category.id ? null : category.id));
                    }}
                    aria-label={`${category.name} 카테고리 메뉴`}
                    aria-haspopup="menu"
                    aria-expanded={activeMenuCategoryId === category.id}
                  >
                    ⋯
                  </button>
                  {activeMenuCategoryId === category.id ? (
                    <div className="panel-action-menu category-action-menu" role="menu" aria-label={`${category.name} 카테고리 메뉴`}>
                      <button
                        type="button"
                        className="panel-action-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setActiveMenuCategoryId(null);
                          handleRenameCategory(category);
                        }}
                      >
                        이름 수정
                      </button>
                      <button
                        type="button"
                        className="panel-action-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setActiveMenuCategoryId(null);
                          handleRecolorCategory(category);
                        }}
                      >
                        색상 수정
                      </button>
                      <button
                        type="button"
                        className="panel-action-menu-item danger"
                        role="menuitem"
                        onClick={() => {
                          setActiveMenuCategoryId(null);
                          handleDeleteCategory(category);
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="panel-utility-button" onClick={handleAddCategory}>카테고리 추가</button>
          </section>
        </aside>

        <section className="calendar-card" aria-label="월간 캘린더">
          <div className="calendar-grid">
            {DAY_LABELS.map((label) => (
              <div key={label} className="day-label">{label}</div>
            ))}

            {monthCells.map((cell) => {
              const selected = isSameDay(cell.date, selectedDate);
              const cellEvents = eventsByDate[formatDateKey(cell.date)] ?? [];
              const visibleEvents = cellEvents.slice(0, MAX_EVENT_DOTS_IN_CELL);
              const hiddenEventCount = Math.max(cellEvents.length - visibleEvents.length, 0);
              const lunarText = getLunarDateText(cell.date);

              return (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(cell.date)}
                  className={[
                    'day-cell',
                    cell.inCurrentMonth ? '' : 'muted',
                    cell.isToday ? 'today' : '',
                    selected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selected}
                  aria-label={formatDateKorean(cell.date)}
                >
                  <div className="day-cell-top-row">
                    <span className="date-number">{cell.date.getDate()}</span>
                    {cell.isToday && <span className="badge">Today</span>}
                  </div>
                  {lunarText && (
                    <span className={`lunar-date ${cell.inCurrentMonth ? '' : 'muted'}`.trim()}>{lunarText}</span>
                  )}
                  <div className="day-events" aria-hidden="true">
                    <div className="event-dots">
                      {visibleEvents.map((event) => (
                        <span
                          key={event.id}
                          className="event-dot"
                          style={{ backgroundColor: getEventColor(event) }}
                        />
                      ))}
                      {hiddenEventCount > 0 && <span className="event-more">+{hiddenEventCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="selected-day-panel" aria-live="polite" aria-label="선택한 날짜 요약">
          <p className="panel-label">선택한 날짜</p>
          <h2 className="panel-date">{formatSelectedDate(selectedDate)}</h2>
          {selectedLunarText && <p className="panel-lunar-date">{selectedLunarText}</p>}

          <button type="button" className="panel-add-button" onClick={openAddForm}>
            일정 추가
          </button>

          <div className="panel-backup-actions" aria-label="백업 및 복구">
            <button type="button" className="panel-utility-button" onClick={handleExportBackup}>
              백업 내보내기
            </button>
            <button type="button" className="panel-utility-button" onClick={handleClickRestoreButton}>
              백업 가져오기
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only-file-input"
              onChange={handleImportBackup}
              aria-label="백업 파일 선택"
              tabIndex={-1}
            />
          </div>

          {isAddFormOpen && (
            <form className="add-event-form" onSubmit={handleAddEvent}>
              <label htmlFor="new-event-title" className="form-label">일정 제목</label>
              <input
                id="new-event-title"
                type="text"
                className="form-input"
                placeholder="예: 주간 리뷰"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                maxLength={40}
                required
              />

              <label htmlFor="new-event-memo" className="form-label">메모 (선택)</label>
              <textarea
                id="new-event-memo"
                className="form-input form-textarea"
                placeholder="필요한 메모를 남겨두세요"
                value={newEventMemo}
                onChange={(e) => setNewEventMemo(e.target.value)}
                maxLength={180}
                rows={3}
              />

              <label htmlFor="new-event-type" className="form-label">일정 종류</label>
              <select
                id="new-event-type"
                className="form-input"
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value as EventRepeatType)}
              >
                <option value="none">양력 일정</option>
                <option value="lunar-yearly" disabled={!canAddLunarRepeat}>매년 음력 반복</option>
              </select>

              {newEventType === 'lunar-yearly' && selectedLunarDate && (
                <p className="form-helper">반복 기준: 음력 {selectedLunarDate.month}.{selectedLunarDate.day}</p>
              )}
              {!canAddLunarRepeat && (
                <p className="form-warning">현재 브라우저에서는 음력 변환을 지원하지 않아 음력 반복 저장을 사용할 수 없습니다.</p>
              )}

              <label htmlFor="new-event-calendar" className="form-label">캘린더</label>
              <select
                id="new-event-calendar"
                className="form-input"
                value={newEventCalendarId}
                onChange={(e) => {
                  const nextCalendarId = e.target.value;
                  setNewEventCalendarId(nextCalendarId);
                  const nextCategory = categories.find((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === nextCalendarId);
                  setNewEventCategoryId(nextCategory?.id ?? getDefaultCategoryIdForCalendar(nextCalendarId));
                }}
              >
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                ))}
              </select>

              <label htmlFor="new-event-category" className="form-label">카테고리</label>
              <select
                id="new-event-category"
                className="form-input"
                value={newEventCategoryId}
                onChange={(e) => setNewEventCategoryId(e.target.value)}
              >
                {addFormCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <p className="form-helper">선택한 카테고리 색상이 캘린더 점 색상으로 사용됩니다.</p>

              <div className="form-actions">
                <button type="button" className="form-secondary" onClick={closeAddForm}>취소</button>
                <button type="submit" className="form-primary" disabled={newEventType === 'lunar-yearly' && !canAddLunarRepeat}>저장</button>
              </div>
            </form>
          )}

          {selectedDateEvents.length === 0 ? (
            <div className="panel-empty-state">
              <p>아직 일정 없음</p>
            </div>
          ) : (
            <ul className="panel-event-list" aria-label="선택 날짜 일정 목록" ref={actionMenuAreaRef}>
              {selectedDateEvents.map((event) => {
                const isEditing = editingEventId === event.id;

                return (
                <li key={event.id} className={`panel-event-item ${isEditing ? 'is-editing' : ''}`.trim()}>
                  {!isEditing && <span className="panel-event-dot" style={{ backgroundColor: getEventColor(event) }} aria-hidden="true" />}
                  <div className="panel-event-content">
                    {isEditing ? (
                      <form className="add-event-form panel-edit-form" onSubmit={(e) => handleEditEvent(e, event)}>
                        <label htmlFor={`edit-event-title-${event.id}`} className="form-label">일정 제목</label>
                        <input
                          id={`edit-event-title-${event.id}`}
                          type="text"
                          className="form-input"
                          value={editingEventTitle}
                          onChange={(e) => setEditingEventTitle(e.target.value)}
                          maxLength={40}
                          required
                        />

                        <label htmlFor={`edit-event-memo-${event.id}`} className="form-label">메모 (선택)</label>
                        <textarea
                          id={`edit-event-memo-${event.id}`}
                          className="form-input form-textarea"
                          value={editingEventMemo}
                          onChange={(e) => setEditingEventMemo(e.target.value)}
                          maxLength={180}
                          rows={3}
                        />

                        <label htmlFor={`edit-event-type-${event.id}`} className="form-label">일정 종류</label>
                        <select
                          id={`edit-event-type-${event.id}`}
                          className="form-input"
                          value={editingEventType}
                          onChange={(e) => setEditingEventType(e.target.value as EventRepeatType)}
                        >
                          <option value="none">양력 일정</option>
                          <option value="lunar-yearly" disabled={!canAddLunarRepeat}>매년 음력 반복</option>
                        </select>

                        {editingEventType === 'lunar-yearly' && selectedLunarDate && (
                          <p className="form-helper">반복 기준: 음력 {selectedLunarDate.month}.{selectedLunarDate.day}</p>
                        )}

                        <label htmlFor={`edit-event-calendar-${event.id}`} className="form-label">캘린더</label>
                        <select
                          id={`edit-event-calendar-${event.id}`}
                          className="form-input"
                          value={editingEventCalendarId}
                          onChange={(e) => {
                            const nextCalendarId = e.target.value;
                            setEditingEventCalendarId(nextCalendarId);
                            const nextCategory = categories.find((category) => (category.calendarId ?? DEFAULT_CALENDAR_ID) === nextCalendarId);
                            setEditingEventCategoryId(nextCategory?.id ?? getDefaultCategoryIdForCalendar(nextCalendarId));
                          }}
                        >
                          {calendars.map((calendar) => (
                            <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                          ))}
                        </select>

                        <label htmlFor={`edit-event-category-${event.id}`} className="form-label">카테고리</label>
                        <select
                          id={`edit-event-category-${event.id}`}
                          className="form-input"
                          value={editingEventCategoryId}
                          onChange={(e) => setEditingEventCategoryId(e.target.value)}
                        >
                                    {editFormCategories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                        <p className="form-helper">선택한 카테고리 색상이 캘린더 점 색상으로 사용됩니다.</p>

                        <div className="form-actions">
                          <button type="button" className="form-secondary" onClick={cancelEditEvent}>취소</button>
                          <button type="submit" className="form-primary" disabled={editingEventType === 'lunar-yearly' && !canAddLunarRepeat}>저장</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span className="panel-event-title">{event.title}</span>
                        {event.memo && <p className="panel-event-memo">{event.memo}</p>}
                        {event.repeatType === 'lunar-yearly' && event.lunarMonth && event.lunarDay && (
                          <span className="panel-event-meta">음력 {event.lunarMonth}.{event.lunarDay} 반복</span>
                        )}
                        {event.categoryId && categoryById[event.categoryId] && (
                          <span className="panel-event-meta">{categoryById[event.categoryId].name}</span>
                        )}
                        {event.calendarId && calendarById[event.calendarId] && (
                          <span className="panel-event-meta">캘린더: {calendarById[event.calendarId].name}</span>
                        )}
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="panel-event-actions">
                      <button
                        type="button"
                        className="panel-action-menu-button"
                        onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          setActiveMenuEventId((prev) => (prev === event.id ? null : event.id));
                        }}
                        aria-label={`${event.title} 일정 액션 메뉴`}
                        aria-haspopup="menu"
                        aria-expanded={activeMenuEventId === event.id}
                      >
                        ⋯
                      </button>
                      {activeMenuEventId === event.id && (
                        <div className="panel-action-menu" role="menu" aria-label={`${event.title} 일정 메뉴`}>
                          <button
                            type="button"
                            className="panel-action-menu-item"
                            role="menuitem"
                            onClick={() => startEditEvent(event)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="panel-action-menu-item danger"
                            role="menuitem"
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}



        </aside>
      </main>
      ) : (
        <main className="routine-layout" aria-label="주간 루틴 보드">
          <section className="routine-workspace">
            <div className="routine-workspace-header">
              <div className="routine-heading">
                <p className="routine-overline">Weekly Routine Board</p>
                <h2>루틴 보드</h2>
                <p className="routine-description">매주 반복되는 일정을 한눈에 관리하세요.</p>
              </div>
              <button type="button" className="routine-primary-cta" onClick={openRoutineForm}>루틴 추가</button>
            </div>
            <section className="routine-board-card">
            {isRoutineFormOpen && (
              <form className="add-event-form routine-form" onSubmit={handleAddRoutine}>
                <label className="form-label" htmlFor="routine-title">제목</label>
                <input id="routine-title" className="form-input" value={routineTitle} onChange={(e) => setRoutineTitle(e.target.value)} required />
                <label className="form-label" htmlFor="routine-calendar">캘린더 선택</label>
                <select id="routine-calendar" className="form-input" value={routineCalendarId} onChange={(e) => { const nextId = e.target.value; setRoutineCalendarId(nextId); setRoutineCategoryId(getDefaultCategoryIdForCalendar(nextId)); }}>
                  {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
                </select>
                <label className="form-label" htmlFor="routine-category">카테고리 선택</label>
                <select id="routine-category" className="form-input" value={routineCategoryId} onChange={(e) => setRoutineCategoryId(e.target.value)}>
                  {routineFormCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <p className="form-label">요일 선택</p>
                <div className="routine-day-picker">
                  {DAY_LABELS.map((day, index) => (
                    <button key={day} type="button" className={`routine-day-button ${routineDaysOfWeek.includes(index) ? 'selected' : ''}`} onClick={() => toggleRoutineDay(index)}>{day}</button>
                  ))}
                </div>
                <label className="form-label" htmlFor="routine-start">시작 시간</label>
                <input id="routine-start" type="time" className="form-input" value={routineStartTime} onChange={(e) => setRoutineStartTime(e.target.value)} required />
                <label className="form-label" htmlFor="routine-end">종료 시간</label>
                <input id="routine-end" type="time" className="form-input" value={routineEndTime} onChange={(e) => setRoutineEndTime(e.target.value)} required />
                <label className="form-label" htmlFor="routine-memo">메모 선택</label>
                <textarea id="routine-memo" className="form-input form-textarea" rows={3} value={routineMemo} onChange={(e) => setRoutineMemo(e.target.value)} />
                <div className="form-actions">
                  <button type="button" className="form-secondary" onClick={closeRoutineForm}>취소</button>
                  <button type="submit" className="form-primary">저장</button>
                </div>
              </form>
            )}
            {routines.length === 0 ? (
              <div className="routine-empty-state">
                <p className="routine-empty-title">아직 등록된 루틴이 없어요</p>
                <p className="routine-empty-description">출근, 알바, 운동처럼 반복되는 일정을 루틴으로 저장해보세요.</p>
                <button type="button" className="routine-empty-action" onClick={openRoutineForm}>첫 루틴 추가하기</button>
              </div>
            ) : (
              <div className="routine-week-board">
                {sortedRoutines.map((routine) => (
                  <article key={routine.id} className={`routine-card-item ${routine.enabled ? '' : 'disabled'}`.trim()}>
                    <div className="routine-card-top">
                      <p className="routine-title">{routine.title}</p>
                      <span className="routine-enabled-badge">{routine.enabled ? '사용중' : '꺼짐'}</span>
                    </div>
                    <div className="routine-day-badges">
                      {routine.daysOfWeek.map((day) => <span key={`${routine.id}-${day}`} className="routine-day-chip">{DAY_LABELS[day]}</span>)}
                    </div>
                    <p className="routine-time">{routine.startTime} - {routine.endTime}</p>
                    <p className="routine-meta">캘린더: {calendarById[routine.calendarId]?.name ?? '-'}</p>
                    <p className="routine-meta">카테고리: {categoryById[routine.categoryId]?.name ?? '-'}</p>
                    {routine.memo && <p className="routine-memo">{routine.memo}</p>}
                    <div className="routine-card-actions">
                      <button type="button" className="form-secondary" onClick={() => handleToggleRoutineEnabled(routine.id)}>{routine.enabled ? '끄기' : '켜기'}</button>
                      <button type="button" className="form-secondary" onClick={() => handleEditRoutine(routine)}>수정</button>
                      <button type="button" className="confirm-modal-danger" onClick={() => handleDeleteRoutine(routine.id)}>삭제</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {routineFeedback && <p className="routine-feedback">{routineFeedback}</p>}
            </section>
          </section>
        </main>
      )}

      {pendingDeleteEventId && (
        <div className="confirm-modal-overlay" role="presentation" onClick={closeDeleteModal}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            aria-describedby="delete-modal-description"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-modal-title" className="confirm-modal-title">일정 삭제</h2>
            <p id="delete-modal-description" className="confirm-modal-description">이 일정을 삭제할까요?</p>
            <div className="confirm-modal-actions">
              <button type="button" className="form-secondary" onClick={closeDeleteModal}>취소</button>
              <button type="button" className="confirm-modal-danger" onClick={confirmDeleteEvent}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
