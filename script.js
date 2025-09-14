
// Store the course data
let courseData = [];
let oldCourseData = [];
let filteredData = [];
let isViewingChanges = false;
let isViewingStarred = false;
let starredCourses = new Set();

// Helper function to format timestamps for display only
function formatTimestampForDisplay(timestamp) {
    if (!timestamp) return "Unknown date";
    return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });
}

// Pagination variables
let currentPage = 1;
let pageSize = 25;
let totalPages = 1;

// Indexes for faster filtering
let courseCodeIndex = {};
let facultyIndex = {};
let roomIndex = {};
let statusIndex = {};

// Load starred courses from localStorage
function loadStarredCourses() {
    const saved = localStorage.getItem('starredCourses');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            starredCourses = new Set(parsed);
        } catch (e) {
            console.error('Error loading starred courses:', e);
            starredCourses = new Set();
        }
    }
}

// Save starred courses to localStorage
function saveStarredCourses() {
    localStorage.setItem('starredCourses', JSON.stringify([...starredCourses]));
}

// Toggle star status for a course
function toggleStar(courseIdentifier) {
    // Get the star button element
    const starBtn = document.querySelector(`.star-btn[data-id="${courseIdentifier}"]`);

    if (starredCourses.has(courseIdentifier)) {
        starredCourses.delete(courseIdentifier);
        if (starBtn) {
            starBtn.innerHTML = '<i class="bi bi-star"></i>';
            starBtn.classList.remove('starred');
        }
    } else {
        starredCourses.add(courseIdentifier);
        if (starBtn) {
            starBtn.innerHTML = '<i class="bi bi-star-fill"></i>';
            starBtn.classList.add('starred');
        }
    }

    // Always save the starred courses immediately
    saveStarredCourses();

    // Only re-filter if we're viewing starred courses
    if (isViewingStarred) {
        filterTable();
    }
}

// Function to fetch course data from Google Sheets or CSV file
async function fetchCourseData() {
    // Check if Google Sheets is configured and enabled
    if (window.GAS_CONFIG && window.GAS_CONFIG.USE_GOOGLE_SHEETS && window.GAS_CONFIG.WEB_APP_URL !== 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec') {
        return fetchFromGoogleSheets('current');
    } else {
        // Fallback to local CSV file
        return fetchFromLocalCSV('course_data.csv');
    }
}

// Function to fetch data from Google Sheets
async function fetchFromGoogleSheets(type = 'current') {
    try {
        const url = `${window.GAS_CONFIG.WEB_APP_URL}?type=${type}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data from Google Sheets');
        }

        const courses = result.data || [];
        
        // Format timestamp for display only
        const lastUpdatedDisplay = formatTimestampForDisplay(result.lastUpdated);

        // Update last updated time
        document.getElementById('lastUpdated').textContent = `Last updated: ${lastUpdatedDisplay}`;
        
        // Show contributor thank you message
        if (result.contributorName && result.contributorName !== 'Unknown User') {
            const contributorThanks = document.getElementById('contributorThanks');
            const thankYouText = document.getElementById('thankYouText');
            thankYouText.textContent = `Thank you ${result.contributorName} for contributing this course data!`;
            contributorThanks.style.display = 'block';
        } else {
            document.getElementById('contributorThanks').style.display = 'none';
        }

        return courses;
    } catch (error) {
        console.error('Error fetching data from Google Sheets:', error);
        
        // Try fallback to local CSV
        console.log('Attempting fallback to local CSV...');
        return fetchFromLocalCSV(type === 'current' ? 'course_data.csv' : 'OLDcourse_data.csv');
    }
}

// Function to fetch course data from local CSV file (fallback)
async function fetchFromLocalCSV(filename) {
    try {
        const response = await fetch(filename);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');
        let lastUpdated = "Unknown date";

        // Check if first line contains metadata (starts with #)
        if (lines[0].trim().startsWith('#')) {
            // Extract lastUpdated timestamp from the comment
            const metadataLine = lines[0].trim();
            const lastUpdatedMatch = metadataLine.match(/# lastUpdated: (.+)/);
            if (lastUpdatedMatch && lastUpdatedMatch[1]) {
                lastUpdated = formatTimestampForDisplay(lastUpdatedMatch[1]);
            }
            // Remove metadata line before parsing
            lines.shift();
        }

        // Parse the remaining CSV data
        const courses = parseCSV(lines.join('\n'));

        // Update last updated time only if this is current data
        if (filename === 'course_data.csv') {
            document.getElementById('lastUpdated').textContent = `Last updated: ${lastUpdated}`;
        }

        return courses;
    } catch (error) {
        console.error(`Error fetching ${filename}:`, error);
        
        // Only show error in table if this is the main data fetch
        if (filename === 'course_data.csv') {
            document.getElementById('courseTableBody').innerHTML = `
                        <tr>
                            <td colspan="9" class="text-danger text-center p-4">
                                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                                Error loading course data. Please check your Google Sheets configuration or ensure ${filename} exists.
                            </td>
                        </tr>
                    `;
        }
        return [];
    }
}

// Function to fetch old course data
async function fetchOldCourseData() {
    // Check if Google Sheets is configured and enabled
    if (window.GAS_CONFIG && window.GAS_CONFIG.USE_GOOGLE_SHEETS && window.GAS_CONFIG.WEB_APP_URL !== 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec') {
        try {
            const courses = await fetchFromGoogleSheets('old');
            
            // Get the timestamp for old data
            const url = `${window.GAS_CONFIG.WEB_APP_URL}?type=old`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.success && result.lastUpdated) {
                const previousDataTimeDisplay = formatTimestampForDisplay(result.lastUpdated);
                document.getElementById('previousDataTime').textContent = previousDataTimeDisplay;
            } else {
                document.getElementById('previousDataTime').textContent = "No previous data available";
            }
            
            return courses;
        } catch (error) {
            console.error('Error fetching old data from Google Sheets:', error);
            // Fallback to local CSV
            return fetchOldCourseDataFromCSV();
        }
    } else {
        // Use local CSV file
        return fetchOldCourseDataFromCSV();
    }
}

// Function to fetch old course data from local CSV (fallback)
async function fetchOldCourseDataFromCSV() {
    try {
        const response = await fetch('OLDcourse_data.csv');

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');
        let previousDataTime = "Unknown date";

        // Check if first line contains metadata (starts with #)
        if (lines[0].trim().startsWith('#')) {
            // Extract lastUpdated timestamp from the comment
            const metadataLine = lines[0].trim();
            const lastUpdatedMatch = metadataLine.match(/# lastUpdated: (.+)/);
            if (lastUpdatedMatch && lastUpdatedMatch[1]) {
                previousDataTime = formatTimestampForDisplay(lastUpdatedMatch[1]);
            }
            // Remove metadata line before parsing
            lines.shift();
        }

        // Parse the remaining CSV data
        const courses = parseCSV(lines.join('\n'));

        // Update previous data timestamp
        document.getElementById('previousDataTime').textContent = previousDataTime;

        return courses;
    } catch (error) {
        console.error('Error fetching old course data:', error);
        document.getElementById('previousDataTime').textContent = "Error loading previous data";
        return [];
    }
}

// Function to parse CSV data more efficiently
function parseCSV(csvText) {
    // Split by lines
    const lines = csvText.split('\n');
    if (lines.length < 2) return [];

    // Get header row and parse headers
    const headers = lines[0].split(',').map(header => header.trim());
    const headerCount = headers.length;
    const courses = [];

    // Pre-allocate array for better performance
    courses.length = lines.length - 1;

    // Process each data row
    let validCourseCount = 0;
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines

        // Handle quoted values properly
        const values = parseCSVLine(lines[i]);
        if (values.length !== headerCount) continue; // Skip malformed lines

        const course = {};

        // Map each value to its corresponding header
        for (let j = 0; j < headerCount; j++) {
            course[headers[j]] = values[j] || '';
        }

        courses[validCourseCount++] = course;
    }

    // Trim array to actual size
    courses.length = validCourseCount;

    return courses;
}

// Helper function to parse CSV line with quoted values
function parseCSVLine(line) {
    const values = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
        } else {
            currentValue += char;
        }
    }

    // Add the last value
    values.push(currentValue.trim());

    // Clean up quotes from values
    return values.map(value => {
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.substring(1, value.length - 1);
        }
        return value;
    });
}

// Function to build indexes from course data for faster filtering
function buildIndexes(courses) {
    // Reset indexes
    courseCodeIndex = {};
    facultyIndex = {};
    roomIndex = {};
    statusIndex = {};

    // Build indexes
    courses.forEach(course => {
        // Course code index
        if (!courseCodeIndex[course.CourseCode]) {
            courseCodeIndex[course.CourseCode] = [];
        }
        courseCodeIndex[course.CourseCode].push(course);

        // Faculty index
        if (!facultyIndex[course.Faculty]) {
            facultyIndex[course.Faculty] = [];
        }
        facultyIndex[course.Faculty].push(course);

        // Room index
        const room = course.Room || "TBA";
        if (!roomIndex[room]) {
            roomIndex[room] = [];
        }
        roomIndex[room].push(course);

        // Status index
        const availableSeats = parseInt(course.TotalSeat) - parseInt(course.TakenSeat);
        const status = availableSeats > 0 ? "Available" : "Full";
        if (!statusIndex[status]) {
            statusIndex[status] = [];
        }
        statusIndex[status].push(course);
    });
}

// Function to populate the table with course data
function populateTable(courses) {
    // Store filtered courses for pagination
    filteredData = courses;

    // Calculate pagination
    totalPages = Math.ceil(filteredData.length / pageSize);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    }

    // Render the current page
    renderCurrentPage();

    // Render pagination controls
    renderPagination();
}

// Function to render the current page of courses
function renderCurrentPage() {
    const tableBody = document.getElementById('courseTableBody');
    const colSpan = isViewingChanges ? '10' : '9';

    // Clear the table body - use faster innerHTML method for bulk removal
    tableBody.innerHTML = '';

    if (filteredData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${colSpan}" class="no-results">
                    <i class="bi bi-search me-2"></i>
                    No courses found matching your criteria.
                </td>
            </tr>
        `;
        hideLoading();
        return;
    }

    // Calculate slice indices for current page
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredData.length);

    // Only render courses for current page
    const coursesToRender = filteredData.slice(startIndex, endIndex);

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    // Create a Set to track unique course identifiers to prevent duplicates
    const processedCourses = new Set();

    // Pre-calculate the columns we need based on view mode
    const hasChangeColumn = isViewingChanges;

    // Render each course row for the current page
    coursesToRender.forEach(course => {
        renderCourseRow(course, fragment, processedCourses, hasChangeColumn);
    });

    // Append all rows to the table body
    tableBody.appendChild(fragment);
    
    // Hide loading after rendering
    hideLoading();
}

// Helper function to render a single course row - optimized version
function renderCourseRow(course, fragment, processedCourses, hasChangeColumn) {
    // Create a unique identifier for each course (combination of code, section, and time)
    const courseIdentifier = `${course.CourseCode}-${course.Section}-${course.CourseTime}`;

    // Skip if we've already processed this course
    if (processedCourses.has(courseIdentifier)) {
        return;
    }

    // Add to processed set
    processedCourses.add(courseIdentifier);

    // Use createElement instead of innerHTML for better performance
    const row = document.createElement('tr');

    // Calculate available seats
    const availableSeats = parseInt(course.TotalSeat) - parseInt(course.TakenSeat);
    const status = availableSeats > 0 ? "Available" : "Full";

    // Add change indicator cell if viewing changes
    if (hasChangeColumn && course.change) {
        const changeCell = document.createElement('td');

        if (course.change !== 'none') {
            let changeText = '';
            if (course.change === 'increased') {
                changeText = `+${course.changeDiff} seats taken`;
            } else if (course.change === 'decreased') {
                changeText = `-${Math.abs(course.changeDiff)} seats taken`;
            } else if (course.change === 'filledUp') {
                changeText = 'Filled up';
            } else if (course.change === 'openedUp') {
                changeText = 'Opened up';
            } else if (course.change === 'facultyChanged') {
                changeText = 'Faculty changed';
            }

            const indicator = document.createElement('span');
            indicator.className = `change-indicator change-${course.change}`;
            changeCell.appendChild(indicator);
            changeCell.appendChild(document.createTextNode(changeText));
            row.classList.add('change-row');
        } else {
            changeCell.textContent = 'No change';
        }

        row.appendChild(changeCell);
    }

    // Add star cell - create elements instead of using innerHTML
    const starCell = document.createElement('td');
    starCell.className = 'star-column';

    const starBtn = document.createElement('button');
    starBtn.className = `star-btn ${starredCourses.has(courseIdentifier) ? 'starred' : ''}`;
    starBtn.dataset.id = courseIdentifier;

    const starIcon = document.createElement('i');
    starIcon.className = `bi bi-star${starredCourses.has(courseIdentifier) ? '-fill' : ''}`;

    starBtn.appendChild(starIcon);
    starCell.appendChild(starBtn);
    row.appendChild(starCell);

    // Add other cells efficiently
    appendTextCell(row, course.CourseCode);
    appendTextCell(row, course.Section);

    // Add faculty cell with previous faculty info if changed
    if (course.facultyChanged && isViewingChanges) {
        const facultyCell = document.createElement('td');
        facultyCell.innerHTML = `${course.Faculty} <span class="faculty-changed">(was: ${course.oldFaculty})</span>`;
        row.appendChild(facultyCell);
    } else {
        appendTextCell(row, course.Faculty);
    }

    appendTextCell(row, course.CourseTime);
    appendTextCell(row, course.Room || "TBA");
    appendTextCell(row, `${availableSeats}/${course.TotalSeat}`);

    // Add status cell with badge
    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `badge ${status === 'Available' ? 'badge-available' : 'badge-full'}`;
    statusBadge.textContent = status;
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    // Add event listener to the star button
    if (starBtn) {
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStar(courseIdentifier);
        });
    }

    fragment.appendChild(row);
}

// Helper function to append a text cell
function appendTextCell(row, text) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.appendChild(cell);
}

// Function to populate filter dropdowns
function populateFilters(courses) {
    const courseFilter = document.getElementById('courseFilter');
    const facultyFilter = document.getElementById('facultyFilter');
    const roomFilter = document.getElementById('roomFilter');

    // Clear existing options except the first one
    while (courseFilter.options.length > 1) {
        courseFilter.remove(1);
    }

    while (facultyFilter.options.length > 1) {
        facultyFilter.remove(1);
    }

    while (roomFilter.options.length > 1) {
        roomFilter.remove(1);
    }

    // Get unique course codes
    const uniqueCourses = [...new Set(courses.map(course => course.CourseCode))];
    uniqueCourses.sort();

    // Get unique faculty names
    const uniqueFaculty = [...new Set(courses.map(course => course.Faculty))];
    uniqueFaculty.sort();

    // Get unique room names
    const uniqueRooms = [...new Set(courses.map(course => course.Room).filter(room => room))];
    uniqueRooms.sort();

    // Add course options
    uniqueCourses.forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = code;
        courseFilter.appendChild(option);
    });

    // Add faculty options
    uniqueFaculty.forEach(faculty => {
        const option = document.createElement('option');
        option.value = faculty;
        option.textContent = faculty;
        facultyFilter.appendChild(option);
    });

    // Add room options
    uniqueRooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room;
        option.textContent = room;
        roomFilter.appendChild(option);
    });
}

// Function to update statistics
function updateStats(courses) {
    const statsContainer = document.getElementById('statsContainer');

    // Calculate statistics
    const totalCourses = courses.length;

    // Count available courses
    const availableCourses = courses.filter(course => {
        const availableSeats = parseInt(course.TotalSeat) - parseInt(course.TakenSeat);
        return availableSeats > 0;
    }).length;

    // Count full courses
    const fullCourses = totalCourses - availableCourses;

    // Count unique course codes
    const uniqueCourses = new Set(courses.map(course => course.CourseCode)).size;

    // Create stats HTML
    statsContainer.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${totalCourses}</div>
                    <div class="stat-label">Total Sections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${uniqueCourses}</div>
                    <div class="stat-label">Unique Courses</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${availableCourses}</div>
                    <div class="stat-label">Available Sections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${fullCourses}</div>
                    <div class="stat-label">Full Sections</div>
                </div>
            `;

    // If viewing changes, add change statistics
    if (isViewingChanges) {
        const changedCourses = courses.filter(course => course.change && course.change !== 'none');

        const increasedCourses = courses.filter(course => course.change === 'increased').length;
        const decreasedCourses = courses.filter(course => course.change === 'decreased').length;
        const filledUpCourses = courses.filter(course => course.change === 'filledUp').length;
        const openedUpCourses = courses.filter(course => course.change === 'openedUp').length;
        const facultyChangedCourses = courses.filter(course => course.change === 'facultyChanged').length;

        statsContainer.innerHTML += `
                    <div class="stat-card">
                        <div class="stat-value">${changedCourses.length}</div>
                        <div class="stat-label">Changed Sections</div>
                    </div>
                `;

        // Update changes summary
        document.getElementById('filledUpCount').textContent = filledUpCourses;
        document.getElementById('openedUpCount').textContent = openedUpCourses;
        document.getElementById('increasedCount').textContent = increasedCourses;
        document.getElementById('decreasedCount').textContent = decreasedCourses;
        document.getElementById('facultyChangedCount').textContent = facultyChangedCourses;
        document.getElementById('totalChangesCount').textContent = changedCourses.length;
    }
}

// Function to compare old and new course data
function compareCoursesData(newCourses, oldCourses) {
    // Create maps for faster lookup
    const oldCoursesMap = new Map();

    oldCourses.forEach(course => {
        const key = `${course.CourseCode}-${course.Section}-${course.CourseTime}`;
        oldCoursesMap.set(key, course);
    });

    // Process each new course to detect changes
    return newCourses.map(newCourse => {
        const key = `${newCourse.CourseCode}-${newCourse.Section}-${newCourse.CourseTime}`;
        const oldCourse = oldCoursesMap.get(key);

        // If no old course data, mark as new (though this is unlikely in this context)
        if (!oldCourse) {
            return { ...newCourse, change: 'new', changeDiff: parseInt(newCourse.TakenSeat) };
        }

        const oldTakenSeats = parseInt(oldCourse.TakenSeat);
        const newTakenSeats = parseInt(newCourse.TakenSeat);
        const oldAvailableSeats = parseInt(oldCourse.TotalSeat) - oldTakenSeats;
        const newAvailableSeats = parseInt(newCourse.TotalSeat) - newTakenSeats;

        let change = 'none';
        const changeDiff = newTakenSeats - oldTakenSeats;

        // Check for faculty change
        const facultyChanged = oldCourse.Faculty !== newCourse.Faculty;
        const oldFaculty = facultyChanged ? oldCourse.Faculty : null;

        // Determine change type
        if (oldAvailableSeats > 0 && newAvailableSeats === 0) {
            change = 'filledUp';
        } else if (oldAvailableSeats === 0 && newAvailableSeats > 0) {
            change = 'openedUp';
        } else if (changeDiff > 0) {
            change = 'increased';
        } else if (changeDiff < 0) {
            change = 'decreased';
        } else if (facultyChanged) {
            change = 'facultyChanged';
        }

        return { ...newCourse, change, changeDiff, facultyChanged, oldFaculty };
    });
}

// Improved debounce function with immediate option
function debounce(func, wait, immediate = false) {
    let timeout;
    return function (...args) {
        const context = this;
        const later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Function to filter the table based on selected filters and search term - optimized with indexes
const filterTable = debounce(function () {
    const courseValue = document.getElementById('courseFilter').value;
    const facultyValue = document.getElementById('facultyFilter').value;
    const roomValue = document.getElementById('roomFilter').value;
    const statusValue = document.getElementById('statusFilter').value;
    const searchValue = document.getElementById('searchInput').value.toLowerCase();
    const changeValue = isViewingChanges ? document.getElementById('changeFilter').value : '';

    // Show loading indicator for better UX during filtering
    if (courseData.length > 300) {
        showLoading('Filtering courses...');
    }

    // Use requestAnimationFrame to prevent UI blocking
    window.requestAnimationFrame(() => {
        // Start with candidate courses based on indexed filters
        let candidateCourses = null;

        // Apply indexed filters first for better performance
        if (courseValue) {
            candidateCourses = courseCodeIndex[courseValue] || [];
        }

        if (facultyValue) {
            const facultyCourses = facultyIndex[facultyValue] || [];
            if (candidateCourses === null) {
                candidateCourses = facultyCourses;
            } else {
                // Intersection of both filters
                candidateCourses = candidateCourses.filter(course =>
                    facultyCourses.some(fc =>
                        fc.CourseCode === course.CourseCode &&
                        fc.Section === course.Section &&
                        fc.CourseTime === course.CourseTime
                    )
                );
            }
        }

        if (roomValue) {
            const roomCourses = roomIndex[roomValue] || [];
            if (candidateCourses === null) {
                candidateCourses = roomCourses;
            } else {
                // Intersection of filters
                candidateCourses = candidateCourses.filter(course =>
                    roomCourses.some(rc =>
                        rc.CourseCode === course.CourseCode &&
                        rc.Section === course.Section &&
                        rc.CourseTime === course.CourseTime
                    )
                );
            }
        }

        if (statusValue) {
            const statusCourses = statusIndex[statusValue] || [];
            if (candidateCourses === null) {
                candidateCourses = statusCourses;
            } else {
                // Intersection of filters
                candidateCourses = candidateCourses.filter(course =>
                    statusCourses.some(sc =>
                        sc.CourseCode === course.CourseCode &&
                        sc.Section === course.Section &&
                        sc.CourseTime === course.CourseTime
                    )
                );
            }
        }

        // If no indexed filters were applied, use all courses
        if (candidateCourses === null) {
            candidateCourses = courseData;
        }

        // Apply remaining non-indexed filters
        filteredData = candidateCourses.filter(course => {
            // Star filter - do this first as it's likely to exclude the most items
            if (isViewingStarred) {
                const courseIdentifier = `${course.CourseCode}-${course.Section}-${course.CourseTime}`;
                if (!starredCourses.has(courseIdentifier)) {
                    return false;
                }
            }

            // Change filter (only when viewing changes)
            if (isViewingChanges && changeValue) {
                if (changeValue === 'noChange' && course.change !== 'none') {
                    return false;
                } else if (changeValue !== 'noChange' && course.change !== changeValue) {
                    return false;
                }
            }

            // Search filter - most expensive operation, do it last
            if (searchValue) {
                // Combine all searchable fields into a single string for faster searching
                const searchableText = `${course.CourseCode} ${course.Section} ${course.Faculty} ${course.CourseTime} ${course.Room}`.toLowerCase();
                return searchableText.includes(searchValue);
            }

            return true;
        });

        // Reset to first page when filters change
        currentPage = 1;

        // Update the table with the filtered data
        populateTable(filteredData);
    });
}, 300); // 300ms debounce delay for better performance

// Function to toggle between current view and changes view
function toggleView(viewChanges) {
    // Show loading during transition
    showLoading(viewChanges ? 'Loading changes...' : 'Loading current data...');
    
    // Use requestAnimationFrame to ensure smooth transition
    requestAnimationFrame(() => {
        isViewingChanges = viewChanges;

        // Toggle active class on buttons with proper state management
        const currentBtn = document.getElementById('viewCurrentBtn');
        const changesBtn = document.getElementById('viewChangesBtn');
        
        currentBtn.classList.toggle('active', !viewChanges);
        changesBtn.classList.toggle('active', viewChanges);

        // Toggle visibility of change-related elements
        const changeHeader = document.getElementById('changeHeader');
        const changeFilterContainer = document.getElementById('changeFilterContainer');
        const changesSummary = document.getElementById('changesSummary');
        const courseTable = document.getElementById('courseTable');
        
        changeHeader.style.display = viewChanges ? 'table-cell' : 'none';
        changeFilterContainer.style.display = viewChanges ? 'block' : 'none';
        changesSummary.style.display = viewChanges ? 'block' : 'none';
        
        // Manage table class for styling consistency
        if (viewChanges) {
            courseTable.classList.add('with-change-column');
        } else {
            courseTable.classList.remove('with-change-column');
        }

        // Update the data and filters
        if (viewChanges) {
            // If we haven't compared the data yet, do it now
            if (courseData.length > 0 && oldCourseData.length > 0 && !courseData[0].hasOwnProperty('change')) {
                courseData = compareCoursesData(courseData, oldCourseData);
            } else if (oldCourseData.length === 0) {
                // If no old data is available, show a message
                console.warn('No old course data available for comparison');
            }
        }

        // Update stats and table
        updateStats(courseData);
        filterTable();
    });
}

// Show loading indicator with smooth transition
function showLoading(message = 'Loading...') {
    const tableBody = document.getElementById('courseTableBody');
    const colSpan = isViewingChanges ? '10' : '9';
    
    tableBody.style.opacity = '0.6';
    tableBody.innerHTML = `
                <tr>
                    <td colspan="${colSpan}">
                        <div class="loading-spinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">${message}</span>
                            </div>
                            <div class="loading-text">${message}</div>
                        </div>
                    </td>
                </tr>
            `;
}

// Hide loading with smooth transition
function hideLoading() {
    const tableBody = document.getElementById('courseTableBody');
    tableBody.style.opacity = '1';
}

// Function to render pagination controls
function renderPagination() {
    const totalItems = filteredData.length;
    totalPages = Math.ceil(totalItems / pageSize);

    // Update pagination info
    document.getElementById('paginationTotal').textContent = totalItems;
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);
    document.getElementById('paginationStart').textContent = start;
    document.getElementById('paginationEnd').textContent = end;

    // Update pagination buttons
    document.getElementById('paginationPrev').disabled = currentPage <= 1;
    document.getElementById('paginationNext').disabled = currentPage >= totalPages;

    // Generate page buttons
    const pagesContainer = document.getElementById('paginationPages');
    pagesContainer.innerHTML = '';

    // Determine which page buttons to show
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // Adjust if we're near the end
    if (endPage - startPage < 4 && startPage > 1) {
        startPage = Math.max(1, endPage - 4);
    }

    // First page button
    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'page-button';
        firstBtn.textContent = '1';
        firstBtn.addEventListener('click', () => goToPage(1));
        pagesContainer.appendChild(firstBtn);

        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            pagesContainer.appendChild(ellipsis);
        }
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = 'page-button' + (i === currentPage ? ' active' : '');
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => goToPage(i));
        pagesContainer.appendChild(pageBtn);
    }

    // Last page button
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            pagesContainer.appendChild(ellipsis);
        }

        const lastBtn = document.createElement('button');
        lastBtn.className = 'page-button';
        lastBtn.textContent = totalPages;
        lastBtn.addEventListener('click', () => goToPage(totalPages));
        pagesContainer.appendChild(lastBtn);
    }
}

// Function to navigate to a specific page
function goToPage(page) {
    currentPage = page;
    renderCurrentPage();
    renderPagination();
    // Scroll to top of table
    document.querySelector('.table-responsive').scrollIntoView({ behavior: 'smooth' });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    // Load starred courses first before anything else
    loadStarredCourses();

    // Show initial loading indicator
    showLoading('Fetching course data...');

    // Fetch course data
    fetchCourseData().then(courses => {
        courseData = courses;
        filteredData = courses;

        // Build indexes for faster filtering
        buildIndexes(courses);

        // Populate filters
        populateFilters(courses);

        // Populate the table
        populateTable(courses);

        // Update statistics
        updateStats(courses);

        // Fetch old course data for comparison
        fetchOldCourseData().then(oldCourses => {
            oldCourseData = oldCourses;
        }).catch(error => {
            console.error('Error fetching old course data:', error);
        });
    });

    // Add event listeners for filters
    document.getElementById('courseFilter').addEventListener('change', filterTable);
    document.getElementById('facultyFilter').addEventListener('change', filterTable);
    document.getElementById('roomFilter').addEventListener('change', filterTable);
    document.getElementById('statusFilter').addEventListener('change', filterTable);

    // Add event listener for search input with input event for better responsiveness
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', filterTable);

    // Add focus and blur events to improve mobile experience
    searchInput.addEventListener('focus', function () {
        this.setAttribute('autocomplete', 'off');
        this.setAttribute('autocorrect', 'off');
        this.setAttribute('spellcheck', 'false');
    });

    // Add event listener for view changes button - using toggleView function
    document.getElementById('viewChangesBtn').addEventListener('click', function () {
        if (!isViewingChanges) {
            toggleView(true);
        }
    });

    // Add event listener for view current button - using toggleView function
    document.getElementById('viewCurrentBtn').addEventListener('click', function () {
        if (isViewingChanges) {
            // Fetch fresh current data when switching back
            showLoading('Refreshing current data...');
            fetchCourseData().then(courses => {
                courseData = courses;
                filteredData = courses;
                toggleView(false);
            }).catch(error => {
                console.error('Error refreshing current data:', error);
                hideLoading();
            });
        }
    });

    // Add event listener for change filter (only once)
    document.getElementById('changeFilter').addEventListener('change', filterTable);

    // Add event listener for view starred button
    document.getElementById('viewStarredBtn').addEventListener('click', function () {
        isViewingStarred = !isViewingStarred;
        if (isViewingStarred) {
            this.classList.add('active');
            this.innerHTML = '<i class="bi bi-star me-1"></i> Show All Courses';
        } else {
            this.classList.remove('active');
            this.innerHTML = '<i class="bi bi-star-fill me-1"></i> View Starred Courses';
        }
        filterTable();
    });

    // Add pagination event listeners
    document.getElementById('paginationPrev').addEventListener('click', () => {
        if (currentPage > 1) {
            goToPage(currentPage - 1);
        }
    });

    document.getElementById('paginationNext').addEventListener('click', () => {
        if (currentPage < totalPages) {
            goToPage(currentPage + 1);
        }
    });

    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1; // Reset to first page
        renderCurrentPage();
        renderPagination();
    });

    // Initialize with default page size
    if (document.getElementById('pageSizeSelect')) {
        pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    }

    // Add event listener for generate routine button
    document.getElementById('generateRoutineBtn').addEventListener('click', generateRoutine);

    // Add event listener for save PDF button
    document.getElementById('savePdfBtn').addEventListener('click', exportRoutineToPDF);
});

// Generate routine based on starred courses
function generateRoutine() {
    // Check if there are any starred courses
    if (starredCourses.size === 0) {
        // Show a modal with a message to star courses first
        const modalBody = document.querySelector('#routineModal .modal-body');
        modalBody.innerHTML = `
            <div class="alert alert-warning text-center p-4">
                <i class="bi bi-exclamation-triangle-fill fs-1 mb-3 d-block"></i>
                <h5>No Starred Courses Found</h5>
                <p>Please star some courses first to generate your routine.</p>
                <button type="button" class="btn btn-primary mt-3" id="goBackAndStarBtn" data-bs-dismiss="modal">
                    <i class="bi bi-star me-1"></i> Go Back and Star Courses
                </button>
            </div>
        `;

        // Show the modal
        const routineModal = new bootstrap.Modal(document.getElementById('routineModal'));
        routineModal.show();

        // Add event listener to the "Go Back and Star Courses" button
        document.getElementById('goBackAndStarBtn').addEventListener('click', function () {
            // If currently viewing starred courses, switch to all courses
            if (isViewingStarred) {
                isViewingStarred = false;
                const starredBtn = document.getElementById('viewStarredBtn');
                starredBtn.classList.remove('active');
                starredBtn.innerHTML = '<i class="bi bi-star-fill me-1"></i> View Starred Courses';
                filterTable(); // Refresh the table to show all courses
            }
        });

        return;
    }

    // Clear the routine table first
    const routineTable = document.getElementById('routineTable');
    const rows = routineTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td:not(.day-cell)');
        cells.forEach(cell => {
            cell.innerHTML = '';
            cell.colSpan = 1;
            cell.className = '';
            cell.style.display = '';
        });
    });

    // Get starred courses from the current course data
    const starredCourseIds = [...starredCourses];
    const starredCourseObjects = courseData.filter(course =>
        starredCourseIds.includes(`${course.CourseCode}-${course.Section}-${course.CourseTime}`)
    );

    // Map day codes to row indices
    const dayMap = {
        'S': 0, // Sunday
        'M': 1, // Monday
        'T': 2, // Tuesday
        'W': 3, // Wednesday
        'R': 4, // Thursday
        'F': 5, // Friday
        'A': 6  // Saturday
    };

    // Map time slots to column indices
    const timeSlots = [
        '08:00 AM - 09:30 AM',
        '09:40 AM - 11:10 AM',
        '11:20 AM - 12:50 PM',
        '01:00 PM - 02:30 PM',
        '02:40 PM - 04:10 PM',
        '04:20 PM - 05:50 PM',
        '06:00 PM - 07:30 PM'
    ];

    // Process each starred course
    starredCourseObjects.forEach(course => {
        // Extract days and time from CourseTime
        const timePattern = /(\d+:\d+ [AP]M) - (\d+:\d+ [AP]M) ([A-Z]+)/;
        const match = course.CourseTime.match(timePattern);

        if (match) {
            const startTime = match[1];
            const endTime = match[2];
            const days = match[3];

            // Find the column index for the time slot
            let startCol = -1;
            let endCol = -1;
            let colspan = 1;

            for (let i = 0; i < timeSlots.length; i++) {
                if (timeSlots[i].includes(startTime)) {
                    startCol = i;
                }
                if (timeSlots[i].includes(endTime)) {
                    endCol = i;
                }
            }

            // Calculate colspan if needed
            if (startCol !== -1 && endCol !== -1 && startCol !== endCol) {
                colspan = endCol - startCol + 1;
            }

            // Add the course to each day's schedule
            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const rowIndex = dayMap[day];

                if (rowIndex !== undefined && startCol !== -1) {
                    const row = rows[rowIndex];
                    const cells = row.querySelectorAll('td:not(.day-cell)');

                    // Check if the cell is already occupied
                    let cellOccupied = false;
                    for (let j = startCol; j < startCol + colspan; j++) {
                        if (cells[j] && cells[j].innerHTML !== '') {
                            cellOccupied = true;
                            break;
                        }
                    }

                    if (!cellOccupied) {
                        // Clear any cells that will be spanned
                        for (let j = startCol + 1; j < startCol + colspan; j++) {
                            if (cells[j]) {
                                cells[j].innerHTML = '';
                                cells[j].style.display = 'none';
                            }
                        }

                        // Set the course in the cell with more vibrant formatting
                        if (cells[startCol]) {
                            cells[startCol].innerHTML = `
                                        <div class="course-cell">
                                            <div class="course-code">${course.CourseCode}</div>
                                            <div class="course-section">Section ${course.Section}</div>
                                            <div class="course-room">${course.Room || "TBA"}</div>
                                        </div>
                                    `;
                            cells[startCol].colSpan = colspan;
                            cells[startCol].className = '';
                        }
                    }
                }
            }
        }
    });

    // Show the modal with the routine
    const routineModal = new bootstrap.Modal(document.getElementById('routineModal'));
    routineModal.show();
}

// Function to export routine as PDF
function exportRoutineToPDF() {
    // Show loading indicator
    const modalBody = document.querySelector('#routineModal .modal-body');
    const originalContent = modalBody.innerHTML;
    modalBody.innerHTML = `
                <div class="text-center p-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Generating PDF...</span>
                    </div>
                    <p class="mt-2">Generating PDF, please wait...</p>
                </div>
            `;

    // Short delay to allow the loading indicator to render
    setTimeout(() => {
        // Restore original content
        modalBody.innerHTML = originalContent;

        const routineElement = document.querySelector('.routine-container');
        const routineTitle = "Class Routine";

        // Use html2canvas with improved settings for mobile
        html2canvas(routineElement, {
            scale: 2, // Higher scale for better quality
            backgroundColor: '#091428',
            logging: false,
            useCORS: true,
            allowTaint: true,
            letterRendering: true,
            removeContainer: true
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');

            try {
                // Initialize jsPDF
                const { jsPDF } = window.jspdf;

                // Create PDF in landscape orientation
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a4'
                });

                // Calculate dimensions to fit the image properly
                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                // Add title
                pdf.setFontSize(16);
                pdf.setTextColor(0, 0, 0);
                pdf.text(routineTitle, pdf.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

                // Add image of the table
                pdf.addImage(imgData, 'PNG', 10, 20, pdfWidth - 20, pdfHeight - 10);

                // Add footer with date
                const date = new Date().toLocaleDateString();
                pdf.setFontSize(10);
                pdf.text(`Generated on: ${date}`, pdf.internal.pageSize.getWidth() - 15, pdf.internal.pageSize.getHeight() - 10, { align: 'right' });

                // Save the PDF with a more compatible method for mobile
                if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                    // For mobile devices, open PDF in a new tab
                    const blob = pdf.output('blob');
                    const blobURL = URL.createObjectURL(blob);
                    window.open(blobURL, '_blank');
                } else {
                    // For desktop, use normal download
                    pdf.save('class_routine.pdf');
                }
            } catch (error) {
                console.error('PDF generation error:', error);
                alert('There was an error generating the PDF. Please try again.');

                // Fallback for Android - just open the image
                if (/Android/i.test(navigator.userAgent)) {
                    const newTab = window.open();
                    newTab.document.body.innerHTML = `
                        <style>body{margin:0;background:#091428;display:flex;justify-content:center;align-items:center;}</style>
                        <img src="${imgData}" style="max-width:100%;">
                    `;
                }
            }
        }).catch(err => {
            console.error('Canvas error:', err);
            alert('Could not generate image of your routine. Please try again.');
        });
    }, 100);
}

// Initialize the page when the DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);
