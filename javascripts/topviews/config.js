/**
 * @file Configuration for Topviews application
 * @author MusikAnimal
 * @copyright 2016 MusikAnimal
 */

const pv = require('../shared/pv');

/**
 * Configuration for Topviews application.
 * This includes selectors, defaults, and other constants specific to Topviews
 * @type {Object}
 */
const config = {
  select2Input: '.aqs-select2-selector',
  dateRangeSelector: '.aqs-date-range-selector',
  defaults: {
    dateRange: 'last-month',
    daysAgo: 7,
    excludes: [],
    project: 'en.wikipedia.org'
  },
  pageSize: 100,
  platformSelector: '#platform-select',
  projectInput: '.aqs-project-input',
  timestampFormat: 'YYYYMMDD00'
};
module.exports = config;
