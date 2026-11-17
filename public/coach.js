// Shared routine analytics + rules-based coach.
// Imported by the browser UI and by scripts/checkin.js (Node).

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function formatDate(iso) {
  const d = fromISO(iso);
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${DAY_NAMES[d.getDay()]}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

export function activeRoutines(state) {
  return (state.routines || []).filter((r) => !r.archived);
}

export function isScheduled(routine, iso) {
  return (routine.days || []).includes(fromISO(iso).getDay());
}

// Days before a routine existed are not misses.
export function isScheduledOn(routine, iso) {
  if (routine.createdAt && iso < routine.createdAt) return false;
  return isScheduled(routine, iso);
}

export function isDone(state, routineId, iso) {
  return Boolean(state.logs?.[iso]?.[routineId]);
}

export function dayStats(state, iso) {
  const scheduled = activeRoutines(state).filter((r) => isScheduledOn(r, iso));
  const done = scheduled.filter((r) => isDone(state, r.id, iso));
  return {
    date: iso,
    scheduled,
    done,
    total: scheduled.length,
    completed: done.length,
    rate: scheduled.length ? done.length / scheduled.length : null,
  };
}

// Current streak over scheduled days. Today is forgiven while it is unfinished.
export function currentStreak(state, routine, todayIso) {
  let count = 0;
  let cursor = todayIso;
  for (let i = 0; i < 730; i++) {
    if (isScheduled(routine, cursor)) {
      if (isDone(state, routine.id, cursor)) count++;
      else if (cursor !== todayIso) break;
    }
    if (routine.createdAt && cursor <= routine.createdAt) break;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function longestStreak(state, routine, todayIso) {
  let best = 0;
  let run = 0;
  let cursor = routine.createdAt || addDays(todayIso, -365);
  let guard = 0;
  while (cursor <= todayIso && guard++ < 800) {
    if (isScheduled(routine, cursor)) {
      if (isDone(state, routine.id, cursor)) {
        run++;
        if (run > best) best = run;
      } else if (cursor !== todayIso) {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

export function daysSinceLastDone(state, routine, todayIso) {
  for (let i = 0; i < 365; i++) {
    if (isDone(state, routine.id, addDays(todayIso, -i))) return i;
  }
  return null;
}

export function rangeSummary(state, todayIso, days = 7, offsetDays = 0) {
  let scheduled = 0;
  let completed = 0;
  for (let i = 0; i < days; i++) {
    const stats = dayStats(state, addDays(todayIso, -i - offsetDays));
    scheduled += stats.total;
    completed += stats.completed;
  }
  return { scheduled, completed, rate: scheduled ? completed / scheduled : null };
}

export function getPlan(state, iso) {
  const plan = state.plans?.[iso];
  return {
    intention: typeof plan?.intention === 'string' ? plan.intention : '',
    routineIds: Array.isArray(plan?.routineIds) ? plan.routineIds : [],
  };
}

export function getReflection(state, iso) {
  const reflection = state.reflections?.[iso];
  return reflection && typeof reflection === 'object' ? reflection : null;
}

export function focusSummary(state, iso) {
  const sessions = (state.sessions || []).filter((s) => s && s.date === iso && Number.isFinite(s.minutes));
  const minutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  return { date: iso, minutes, count: sessions.length, sessions };
}

export function focusRangeSummary(state, todayIso, days = 7) {
  const dates = new Set();
  for (let i = 0; i < days; i++) dates.add(addDays(todayIso, -i));
  const sessions = (state.sessions || []).filter((s) => s && dates.has(s.date) && Number.isFinite(s.minutes));
  return {
    sessions,
    minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
    count: sessions.length,
  };
}

export function completionRate(state, routine, todayIso, days = 28) {
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const iso = addDays(todayIso, -i);
    if (!isScheduledOn(routine, iso)) continue;
    const complete = isDone(state, routine.id, iso);
    // An unfinished today should not lower the rate first thing in the morning.
    if (iso === todayIso && !complete) continue;
    scheduled++;
    if (complete) done++;
  }
  return { scheduled, done, rate: scheduled ? done / scheduled : null };
}

export function formatMinutes(total) {
  const minutes = Math.max(0, Math.round(Number(total) || 0));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`;
}

export function totalCompletions(state) {
  const ids = new Set(activeRoutines(state).map((r) => r.id));
  let count = 0;
  for (const day of Object.values(state.logs || {})) {
    for (const [id, done] of Object.entries(day)) if (done && ids.has(id)) count++;
  }
  return count;
}

export function heatmapData(state, todayIso, weeks = 10) {
  const endSunday = addDays(todayIso, -fromISO(todayIso).getDay());
  const start = addDays(endSunday, -(weeks - 1) * 7);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      const stats = dayStats(state, iso);
      week.push({
        date: iso,
        future: iso > todayIso,
        total: stats.total,
        completed: stats.completed,
        rate: stats.rate,
      });
    }
    out.push(week);
  }
  return out;
}

function pct(rate) {
  return `${Math.round((rate || 0) * 100)}%`;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function timeOfDay(now) {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export function buildInsights(state, todayIso, now = new Date()) {
  const insights = [];
  const routines = activeRoutines(state);

  if (!routines.length) {
    return [{
      tone: 'info',
      text: 'Your tracker is empty. Add a routine and I will start measuring streaks, weekly consistency and where to focus.',
    }];
  }

  const stats = dayStats(state, todayIso);
  const best = routines
    .map((r) => ({ routine: r, streak: currentStreak(state, r, todayIso) }))
    .sort((a, b) => b.streak - a.streak)[0];
  const week = rangeSummary(state, todayIso, 7);

  if (stats.total && stats.completed === stats.total) {
    insights.push({
      tone: 'good',
      text: `All ${stats.total} routines done today. That is a clean sweep${best.streak > 1 ? `, and ${best.routine.name} is on a ${best.streak}-day streak` : ''}.`,
    });
  } else if (stats.total) {
    const remaining = stats.scheduled.filter((r) => !isDone(state, r.id, todayIso));
    const names = remaining.slice(0, 2).map((r) => r.name).join(' and ');
    const suffix = remaining.length > 2 ? ` — plus ${remaining.length - 2} more — are` : remaining.length === 2 ? ' are' : ' is';
    insights.push({
      tone: 'info',
      text: `${stats.completed} of ${stats.total} done today. ${names}${suffix} still open.`,
    });
  } else {
    insights.push({ tone: 'info', text: 'Nothing is scheduled for today. A rest day is part of the plan.' });
  }

  if (best.streak >= 3) {
    insights.push({
      tone: 'good',
      text: `Your strongest active streak is ${best.routine.name} at ${best.streak} days. Protect it with the smallest possible version on low-energy days.`,
    });
  } else if (routines.length && week.scheduled >= 5) {
    insights.push({
      tone: 'info',
      text: 'No streak has taken hold yet. Pick one routine and aim for three days in a row; momentum follows the first repeat.',
    });
  }

  const plan = getPlan(state, todayIso);
  const focus = focusSummary(state, todayIso);
  const focusedRoutines = plan.routineIds
    .map((id) => routines.find((r) => r.id === id))
    .filter(Boolean);
  if (plan.intention || focusedRoutines.length || focus.minutes) {
    const bits = [];
    if (plan.intention) bits.push(`Intention: “${plan.intention}”.`);
    if (focusedRoutines.length) {
      const done = focusedRoutines.filter((r) => isDone(state, r.id, todayIso)).length;
      bits.push(`Focus routines ${done}/${focusedRoutines.length} done.`);
    }
    if (focus.minutes) bits.push(`${formatMinutes(focus.minutes)} of focus logged.`);
    const focusDone = focusedRoutines.length > 0
      && focusedRoutines.every((r) => isDone(state, r.id, todayIso));
    insights.push({
      tone: focusDone || focus.minutes >= 45 ? 'good' : 'info',
      text: bits.join(' '),
    });
  }

  const neglected = routines
    .map((r) => ({ routine: r, gap: daysSinceLastDone(state, r, todayIso) }))
    .filter((x) => x.gap !== null && x.gap >= 3 && !isDone(state, x.routine.id, todayIso))
    .sort((a, b) => b.gap - a.gap)[0];
  if (neglected) {
    insights.push({
      tone: 'warn',
      text: `${neglected.routine.name} has not been checked off in ${neglected.gap} days. Shrink it for tomorrow morning instead of waiting for a perfect day.`,
    });
  }

  if (week.scheduled >= 7) {
    const prev = rangeSummary(state, todayIso, 7, 7);
    if (prev.rate !== null) {
      const diff = Math.round((week.rate - prev.rate) * 100);
      if (Math.abs(diff) >= 5) {
        insights.push({
          tone: diff > 0 ? 'good' : 'warn',
          text: `Last 7 days: ${pct(week.rate)} completion, ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} points from the week before.`,
        });
      }
    }
  }

  if (stats.total && stats.completed < stats.total) {
    const hour = now.getHours();
    if (hour < 11) {
      insights.push({ tone: 'info', text: 'Morning window: knock out the routine you are most likely to skip later.' });
    } else if (hour >= 19) {
      insights.push({ tone: 'info', text: 'Evening check: a two-minute version still counts and keeps the streak alive.' });
    }
  }

  const order = { good: 0, info: 1, warn: 2 };
  return insights.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}

export function weeklyReview(state, todayIso) {
  const week = rangeSummary(state, todayIso, 7);
  const prev = rangeSummary(state, todayIso, 7, 7);
  const routines = activeRoutines(state);
  const perRoutine = routines.map((r) => {
    let scheduled = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const iso = addDays(todayIso, -i);
      if (isScheduledOn(r, iso)) {
        scheduled++;
        if (isDone(state, r.id, iso)) done++;
      }
    }
    return { routine: r, scheduled, done, rate: scheduled ? done / scheduled : null };
  }).filter((x) => x.scheduled > 0);

  return { week, prev, perRoutine };
}

export function answerQuestion(state, todayIso, message, now = new Date()) {
  const text = String(message || '').toLowerCase().trim();
  const routines = activeRoutines(state);
  const stats = dayStats(state, todayIso);
  const plan = getPlan(state, todayIso);
  const focus = focusSummary(state, todayIso);
  const streakList = routines
    .map((r) => ({ routine: r, streak: currentStreak(state, r, todayIso) }))
    .sort((a, b) => b.streak - a.streak);

  if (!routines.length) {
    return 'Nothing is tracked yet. Add your first routine with the button above the checklist, then ask me again.';
  }

  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/.test(text)) {
    const left = stats.total - stats.completed;
    return left > 0
      ? `Good ${timeOfDay(now)}. ${left} ${plural(left, 'routine is', 'routines are')} left today. Ask me about today, this week, streaks or what to focus on.`
      : `Good ${timeOfDay(now)}. Today is fully checked off — nothing to chase. Ask me about the week or your streaks.`;
  }

  if (/(pomodoro|deep work|focus (time|minutes|sessions?|timer|this week|today|yesterday)|how (was|is) my focus)/.test(text)) {
    const weekFocus = focusRangeSummary(state, todayIso, 7);
    if (!weekFocus.minutes) {
      return 'No focus sessions logged yet. Start the timer on the Today page — even 15 minutes counts, and it lands in tonight’s report.';
    }
    const todayPart = focus.minutes
      ? `${formatMinutes(focus.minutes)} today across ${focus.count} ${plural(focus.count, 'session', 'sessions')}`
      : 'nothing logged today yet';
    return `Focus: ${todayPart}. Last 7 days: ${formatMinutes(weekFocus.minutes)} across ${weekFocus.count} ${plural(weekFocus.count, 'session', 'sessions')}.`;
  }

  if (/(streak|chain|consisten)/.test(text)) {
    const active = streakList.filter((s) => s.streak > 0);
    if (!active.length) {
      return 'No active streaks right now. Checking off any routine today starts one — the first repeat is the hard part.';
    }
    const top = active.slice(0, 3).map((s) => `${s.routine.name} (${s.streak} ${plural(s.streak, 'day', 'days')})`).join(', ');
    return `Current streaks: ${top}.${active[0].streak >= 7 ? ' That is a habit with roots now.' : ' Keep the next link easy.'}`;
  }

  if (/(week|weekly|review|last 7|seven day)/.test(text)) {
    const { week, prev } = weeklyReview(state, todayIso);
    if (!week.scheduled) return 'No scheduled check-ins in the last seven days, so there is nothing to review yet.';
    let out = `Last 7 days: ${week.completed} of ${week.scheduled} scheduled check-ins (${pct(week.rate)}).`;
    if (prev.rate !== null) {
      const diff = Math.round((week.rate - prev.rate) * 100);
      if (diff > 0) out += ` That is up ${diff} points from the week before.`;
      else if (diff < 0) out += ` That is down ${Math.abs(diff)} points from the week before — normal variance, one good day corrects it.`;
      else out += ' Exactly level with the week before.';
    }
    const weakest = weeklyReview(state, todayIso).perRoutine
      .filter((x) => x.rate !== null && x.rate < 1)
      .sort((a, b) => a.rate - b.rate)[0];
    if (weakest) out += ` Weakest link: ${weakest.routine.name} (${weakest.done}/${weakest.scheduled}).`;
    const weekFocus = focusRangeSummary(state, todayIso, 7);
    if (weekFocus.minutes) {
      out += ` Focus time: ${formatMinutes(weekFocus.minutes)} across ${weekFocus.count} ${plural(weekFocus.count, 'session', 'sessions')}.`;
    }
    return out;
  }

  if (/(intention|intent|today's plan|today’s plan|plan for today)/.test(text)) {
    return plan.intention
      ? `Today’s intention: “${plan.intention}”. Keep the next action small enough to start.`
      : 'No intention set yet. Add one line in the focus panel — a direction for the day, not another task.';
  }

  if (/(focus|what should i|suggest|recommend|next|priorit|advice)/.test(text)) {
    const focused = plan.routineIds.map((id) => routines.find((r) => r.id === id)).filter(Boolean);
    const openFocus = focused.filter((r) => !isDone(state, r.id, todayIso));
    if (openFocus.length) {
      return `Today’s focus: ${openFocus.map((r) => r.name).join(', ')}. Start with ${openFocus[0].name}; the timer is on the right when you are ready.`;
    }
    if (focused.length) {
      return `All ${focused.length} of today’s focus routines are done.${focus.minutes ? ` You also logged ${formatMinutes(focus.minutes)} of focus time.` : ''}`;
    }
    if (plan.intention) {
      return `Today’s intention is “${plan.intention}”. Pick one routine from Today, star it, and let that be the next action.`;
    }
    const undone = stats.scheduled.filter((r) => !isDone(state, r.id, todayIso));
    if (undone.length) {
      const withGap = undone.map((r) => ({ r, gap: daysSinceLastDone(state, r, todayIso) ?? 99 }))
        .sort((a, b) => b.gap - a.gap)[0];
      return `Focus on ${withGap.r.name}${withGap.gap !== 99 && withGap.gap > 0 ? ` — untouched for ${withGap.gap} ${plural(withGap.gap, 'day', 'days')}` : ''}. Do the ten-minute version now, before the day gets noisy.`;
    }
    const target = weeklyReview(state, todayIso).perRoutine
      .filter((x) => x.rate !== null && x.rate < 1)
      .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))[0];
    return target
      ? `Today is done. For tomorrow, ${target.routine.name} is your weakest routine (${target.done}/${target.scheduled} this week) — give it the best slot in your morning.`
      : 'Everything is checked off and every routine is at 100% this week. Spend the saved time on recovery so tomorrow starts full.';
  }

  if (/(miss|behind|fail|bad|slump|struggl|guilt|quit|broke)/.test(text)) {
    const rate = pct(weekOrRange(state, todayIso));
    return `A missed day does not erase accumulated progress; your 7-day completion is still ${rate}. Reset rule: pick the smallest routine and finish it before noon — not after the perfect plan returns.`;
  }

  if (/(thank|thx)/.test(text)) {
    return 'Anytime. One check-in at a time.';
  }

  if (/(add|create|new routine|edit|delete|remove)/.test(text)) {
    return 'Use the Add routine button on the Today panel for new habits, and the edit or delete actions on each row to change them. Changes save automatically.';
  }

  if (/(help|what can you|how do you|capab)/.test(text)) {
    return 'I can report today’s progress, review the last seven days, explain your streaks, pick what to focus on, summarize focus time, or reset after missed days. I work entirely from the data in this tracker.';
  }

  if (/(today|progress|how.*(doing|going)|status|am i)/.test(text)) {
    if (!stats.total) return 'Nothing is scheduled today, so there is no target to hit.';
    const remaining = stats.scheduled.filter((r) => !isDone(state, r.id, todayIso)).map((r) => r.name);
    const focusPart = focus.minutes ? ` Focus time: ${formatMinutes(focus.minutes)}.` : '';
    return `${stats.completed} of ${stats.total} done (${pct(stats.rate)}).${remaining.length ? ` Left: ${remaining.slice(0, 3).join(', ')}${remaining.length > 3 ? '…' : ''}.` : ' Everything is checked off.'}${focusPart}`;
  }

  const fallbackStats = stats.total
    ? `${stats.completed}/${stats.total} routines done today`
    : 'no routines scheduled today';
  return `I track this locally and answer from your data. Right now: ${fallbackStats}. Ask about today, this week, streaks or what to focus on.`;
}

function weekOrRange(state, todayIso) {
  const week = rangeSummary(state, todayIso, 7);
  return week.rate ?? 0;
}

export function buildDailyReport(state, dateIso, now = new Date()) {
  const stats = dayStats(state, dateIso);
  const lines = [`# Daily check-in — ${formatDate(dateIso)}`, ''];

  if (!stats.total) {
    lines.push('_No routines scheduled for this day._');
  } else {
    lines.push(`Progress: **${stats.completed}/${stats.total}** (${pct(stats.rate)})`, '');
    for (const routine of stats.scheduled) {
      const done = isDone(state, routine.id, dateIso);
      const streak = currentStreak(state, routine, dateIso);
      lines.push(`- [${done ? 'x' : ' '}] ${routine.name}${streak > 1 ? ` — ${streak}-day streak` : ''}`);
    }
  }

  const plan = getPlan(state, dateIso);
  if (plan.intention) lines.push('', `Intention: **${plan.intention}**`);
  const focused = plan.routineIds
    .map((id) => (state.routines || []).find((r) => r.id === id))
    .filter(Boolean);
  if (focused.length) {
    lines.push('', '## Today’s focus', '');
    for (const routine of focused) {
      lines.push(`- [${isDone(state, routine.id, dateIso) ? 'x' : ' '}] ${routine.name}`);
    }
  }

  const focus = focusSummary(state, dateIso);
  if (focus.minutes) {
    const names = [...new Set(focus.sessions
      .map((session) => (state.routines || []).find((r) => r.id === session.routineId)?.name)
      .filter(Boolean))];
    const suffix = names.length ? ` — ${names.join(', ')}` : '';
    lines.push('', `Focus time: **${formatMinutes(focus.minutes)}** across ${focus.count} ${plural(focus.count, 'session', 'sessions')}${suffix}`);
  }

  const week = rangeSummary(state, dateIso, 7);
  if (week.scheduled) {
    lines.push('', `Rolling 7 days: ${week.completed}/${week.scheduled} (${pct(week.rate)})`);
  }

  const reflection = getReflection(state, dateIso);
  if (reflection) {
    lines.push('', '## Day close', '');
    const bits = [];
    if (reflection.energy) bits.push(`Energy: **${reflection.energy}**`);
    if (reflection.rating) bits.push(`Rating: **${reflection.rating}/5**`);
    if (bits.length) lines.push(bits.join(' · '));
    if (reflection.note) lines.push('', `> ${reflection.note.split('\n').join('\n> ')}`);
  }

  lines.push('', '## Coach notes', '');
  for (const insight of buildInsights(state, dateIso, now)) {
    lines.push(`- ${insight.text}`);
  }
  return `${lines.join('\n')}\n`;
}
