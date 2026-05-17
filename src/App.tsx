import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const MAX_EVENT_DOTS_IN_CELL = 4;
const STORAGE_KEY = 'uplog-events';
const EVENT_COLOR_PRESETS = ['#3b82f6', '#8b5cf6', '#0ea5a4', '#f97316', '#ec4899'];

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
};

type LunarDate = {
  month: number;
  day: number;
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  events: Event[];
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
  };
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
    },
    {
      id: 'event-2',
      title: '팀 주간 미팅',
      date: formatDateKey(laterInMonth),
      color: '#8b5cf6',
      calendarType: 'solar',
      repeatType: 'none',
    },
    {
      id: 'event-3',
      title: '운동 기록 점검',
      date: formatDateKey(anotherDay),
      color: '#0ea5a4',
      calendarType: 'solar',
      repeatType: 'none',
    },
  ];
};

function App() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventColor, setNewEventColor] = useState(EVENT_COLOR_PRESETS[0]);
  const [newEventMemo, setNewEventMemo] = useState('');
  const [newEventType, setNewEventType] = useState<EventRepeatType>('none');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState('');
  const [editingEventColor, setEditingEventColor] = useState(EVENT_COLOR_PRESETS[0]);
  const [editingEventMemo, setEditingEventMemo] = useState('');
  const [editingEventType, setEditingEventType] = useState<EventRepeatType>('none');
  const [activeMenuEventId, setActiveMenuEventId] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const actionMenuAreaRef = useRef<HTMLUListElement>(null);

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!actionMenuAreaRef.current?.contains(e.target as Node)) {
        setActiveMenuEventId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const monthCells = useMemo(() => createMonthGrid(currentMonth), [currentMonth]);

  const eventsByDate = useMemo(() => {
    return monthCells.reduce<Record<string, Event[]>>((acc, cell) => {
      const dateKey = formatDateKey(cell.date);
      const lunarDate = getLunarDate(cell.date);

      const matchedEvents = events.filter((event) => {
        if (event.repeatType === 'lunar-yearly') {
          return Boolean(lunarDate && event.lunarMonth === lunarDate.month && event.lunarDay === lunarDate.day);
        }

        return event.date === dateKey;
      });

      if (matchedEvents.length > 0) {
        acc[dateKey] = matchedEvents;
      }

      return acc;
    }, {});
  }, [events, monthCells]);

  const monthTitle = `${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월`;
  const selectedDateEvents = eventsByDate[formatDateKey(selectedDate)] ?? [];
  const selectedLunarText = getLunarDateText(selectedDate, true);
  const selectedLunarDate = getLunarDate(selectedDate);
  const canAddLunarRepeat = selectedLunarDate !== null;

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
    setNewEventColor(EVENT_COLOR_PRESETS[0]);
    setNewEventType('none');
    setNewEventMemo('');
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
      color: newEventColor,
      memo: trimmedMemo || undefined,
      calendarType: newEventType === 'lunar-yearly' ? 'lunar' : 'solar',
      repeatType: newEventType,
      lunarMonth: newEventType === 'lunar-yearly' ? selectedLunarDate?.month : undefined,
      lunarDay: newEventType === 'lunar-yearly' ? selectedLunarDate?.day : undefined,
    };

    setEvents((prev) => [...prev, createdEvent]);
    closeAddForm();
  };


  const handleExportBackup = () => {
    const backupData: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      events,
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

      if (!parsed || !Array.isArray(parsed.events)) {
        window.alert('백업 파일 형식이 올바르지 않습니다. events 배열이 필요합니다.');
        target.value = '';
        return;
      }

      const normalizedEvents = parsed.events.map(normalizeEvent).filter((item): item is Event => item !== null);

      if (normalizedEvents.length !== parsed.events.length) {
        window.alert('일부 일정 데이터 형식이 올바르지 않아 복원할 수 없습니다.');
        target.value = '';
        return;
      }

      const shouldRestore = window.confirm('백업을 가져오면 현재 일정이 백업 내용으로 덮어써집니다. 복원할까요?');
      if (!shouldRestore) {
        target.value = '';
        return;
      }

      setEvents(normalizedEvents);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedEvents));
      window.alert('백업 가져오기가 완료되었습니다.');
    } catch {
      window.alert('백업 파일을 읽을 수 없습니다. JSON 파일인지 확인해 주세요.');
    } finally {
      target.value = '';
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    setActiveMenuEventId(null);
    const shouldDelete = window.confirm('이 일정을 삭제할까요?');
    if (!shouldDelete) {
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  };

  const startEditEvent = (event: Event) => {
    setActiveMenuEventId(null);
    setIsAddFormOpen(false);
    setEditingEventId(event.id);
    setEditingEventTitle(event.title);
    setEditingEventColor(event.color);
    setEditingEventMemo(event.memo ?? '');
    setEditingEventType(event.repeatType);
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEditingEventTitle('');
    setEditingEventColor(EVENT_COLOR_PRESETS[0]);
    setEditingEventMemo('');
    setEditingEventType('none');
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
          color: editingEventColor,
          memo: trimmedMemo || undefined,
          calendarType: editingEventType === 'lunar-yearly' ? 'lunar' : 'solar',
          repeatType: editingEventType,
          lunarMonth: editingEventType === 'lunar-yearly' ? selectedLunarDate?.month ?? event.lunarMonth : undefined,
          lunarDay: editingEventType === 'lunar-yearly' ? selectedLunarDate?.day ?? event.lunarDay : undefined,
        };
      }),
    );
    cancelEditEvent();
  };

  return (
    <div className="app-shell">
      <header className="calendar-header">
        <div className="brand-block">
          <h1>UpLog</h1>
          <p className="brand-subtitle">Monthly Calendar</p>
        </div>
        <div className="month-controls" aria-label="월 이동 컨트롤">
          <button type="button" onClick={goPrevMonth} aria-label="이전 달" className="icon-button">◀</button>
          <p className="month-title" aria-live="polite" aria-label="현재 표시 중인 월">{monthTitle}</p>
          <button type="button" onClick={goNextMonth} aria-label="다음 달" className="icon-button">▶</button>
          <button type="button" onClick={goToday} className="today-button">오늘</button>
        </div>
      </header>

      <main className="calendar-layout" aria-label="월간 캘린더와 선택 날짜 요약">
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
                          style={{ backgroundColor: event.color }}
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

              <p className="form-label">색상 선택</p>
              <div className="color-options" role="radiogroup" aria-label="일정 색상 선택">
                {EVENT_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-option ${newEventColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewEventColor(color)}
                    aria-label={`색상 ${color}`}
                    aria-pressed={newEventColor === color}
                  />
                ))}
              </div>

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
                  {!isEditing && <span className="panel-event-dot" style={{ backgroundColor: event.color }} aria-hidden="true" />}
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

                        <p className="form-label">색상 선택</p>
                        <div className="color-options" role="radiogroup" aria-label="일정 색상 수정">
                          {EVENT_COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`color-option ${editingEventColor === color ? 'active' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => setEditingEventColor(color)}
                              aria-label={`색상 ${color}`}
                              aria-pressed={editingEventColor === color}
                            />
                          ))}
                        </div>

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
    </div>
  );
}

export default App;
