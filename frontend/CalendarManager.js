class CalendarManager {
  constructor(container) {
    this.container = container;
    this.days = "Monday Tuesday Wednesday Thursday Friday Saturday Sunday".split(" ");
    this.months = "January February March April May June July August September October November December".split(" ");
    this.year = new Date().getFullYear();

    document.getElementById("calendarEventSaveButton").onclick = () => {
      const eventName = document.getElementById("calendarEventInput").innerText;
      const events = this.getEvents();
      events[this.selectedDate] = eventName;
      this.setEvents(events);
      this.renderCalendar();
      closeDialog(document.getElementById("calendarDialog"));
    };
  }

  getEvents() {
    try {
      const events = JSON.parse(fm.getNoteText("calendar"));
      return events;
    } catch (e) {
      return {};
    }
  }
  setEvents(events) {
    fm.setNoteText("calendar", JSON.stringify(events));
  }

  renderYearSelector() {
    const from = 2000;
    const to = new Date().getFullYear() + 20;
    const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    this.yearSelectorElement.innerHTML = "";
    years.forEach((item) => {
      const option = new Option(item, item);
      this.yearSelectorElement.add(option);
    });
    this.yearSelectorElement.onchange = (e) => {
      const value = e.target.value;
      this.year = value;
      this.renderCalendar();
    };
    this.yearSelectorElement.value = this.year;
  }

  renderCalendar() {
    const year = this.year;
    const events = this.getEvents();

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();

    // Render Months
    this.container.innerHTML = "";
    for (let m = 0; m < this.months.length; m++) {
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const firstWeekday = (new Date(year, m, 1).getDay() + 6) % 7; // 0: Monday, 6: Sunday

      const monthContainer = document.createElement("div");
      monthContainer.className = "calendarMonthContainer";
      this.container.appendChild(monthContainer);

      const el = document.createElement("t");
      el.className = "calendarMonthName";
      el.innerText = this.months[m];
      monthContainer.appendChild(el);

      const weekdayRow = document.createElement("div");
      weekdayRow.className = "calendarWeekdayRow";
      for (const day of this.days) {
        const dayLabel = document.createElement("div");
        dayLabel.innerText = day;
        weekdayRow.appendChild(dayLabel);
      }
      monthContainer.appendChild(weekdayRow);

      const dayContainer = document.createElement("div");
      dayContainer.className = "calendarDayContainer";
      monthContainer.appendChild(dayContainer);

      for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement("div");
        el.className = "calendarDayBox";
        if (d == 1) {
          el.style.gridColumnStart = firstWeekday + 1;
        }

        const dayNumber = document.createElement("t");
        dayNumber.innerHTML = d;
        el.appendChild(dayNumber);

        if (year == todayYear && m + 1 == todayMonth && d == todayDay) {
          el.classList.add("today");
        }

        const dateString = year + "." + (m + 1) + "." + d;
        const event = events[dateString];
        if (event && event.trim().length > 0) {
          el.classList.add("highlighted");
          const ev = document.createElement("t");
          ev.innerHTML = event;
          el.appendChild(ev);
        }

        el.onclick = () => {
          openDialog("calendarDialog");
          document.getElementById("calendarEventInput").innerText = event ?? "";
          this.selectedDate = dateString;
          console.log(dateString);
        };

        dayContainer.appendChild(el);
      }
    }
  }
}
