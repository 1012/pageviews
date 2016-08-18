/**
 * Topviews Analysis tool
 * @file Main file for Topviews application
 * @author MusikAnimal
 * @copyright 2016 MusikAnimal
 * @license MIT License: https://opensource.org/licenses/MIT
 */

const config = require('./config');
const siteMap = require('../shared/site_map');
const siteDomains = Object.keys(siteMap).map(key => siteMap[key]);
const Pv = require('../shared/pv');

/** Main TopViews class */
class TopViews extends Pv {
  constructor() {
    super(config);
    this.app = 'topviews';

    this.excludes = [];
    this.offset = 0;
    this.max = null;
    this.pageData = [];
    this.pageNames = [];
  }

  /**
   * Initialize the application.
   * Called in `pv.js` after translations have loaded
   * @return {null} Nothing
   */
  initialize() {
    this.setupProjectInput();
    this.setupDateRangeSelector();
    this.popParams();
    this.updateInterAppLinks();
  }

  /**
   * Apply user input by updating the URL query string and view, if needed
   * @param {boolean} force - apply all user options even if we've detected nothing has changed
   * @returns {Deferred} deferred object from initData
   */
  processInput(force) {
    this.pushParams();

    /** prevent redundant querying */
    if (location.search === this.params && !force) {
      return false;
    }
    this.params = location.search;

    this.resetView(false);
    return this.initData().then(this.drawData.bind(this));
  }

  /**
   * Print list of top pages
   * @returns {null} nothing
   */
  drawData() {
    this.stopSpinny();
    $('.chart-container').html('');
    $('.expand-chart').show();

    let count = 0, index = 0;

    while (count < this.config.pageSize + this.offset) {
      let item = this.pageData[index++];

      if (this.excludes.includes(item.article)) continue;
      if (!this.max) this.max = item.views;

      const width = 100 * (item.views / this.max),
        direction = !!i18nRtl ? 'to left' : 'to right';

      $('.chart-container').append(
        `<div class='topview-entry' style='background:linear-gradient(${direction}, #EEE ${width}%, transparent ${width}%)'>
         <span class='topview-entry--remove glyphicon glyphicon-remove' data-article-id=${index - 1} aria-hidden='true'></span>
         <span class='topview-entry--rank'>${++count}</span>
         <a class='topview-entry--label' href="${this.getPageURL(item.article)}" target="_blank">${item.article}</a>
         <span class='topview-entry--leader'></span>
         <a class='topview-entry--views' href='${this.getPageviewsURL(item.article)}'>${this.formatNumber(item.views)}</a></div>`
      );
    }

    this.pushParams();
    $('.data-links').removeClass('invisible');
    $('.search-topviews').removeClass('invisible');

    $('.topview-entry--remove').off('click').on('click', e => {
      const pageName = this.pageNames[$(e.target).data('article-id')];
      this.addExclude(pageName);
      this.pushParams();
    });
  }

  /**
   * Add given page(s) to list of excluded pages and optionally re-render the view
   * @param {Array|String} pages - page(s) to add to excludes
   * @param {Boolean} [triggerChange] - whether or not to re-render the view
   * @returns {null} nothing
   */
  addExclude(pages, triggerChange = true) {
    if (!Array.isArray(pages)) pages = [pages];

    pages.forEach(page => {
      if (!this.excludes.includes(page)) {
        this.excludes.push(page);
      }
    });

    $(config.articleSelector).html('');

    this.excludes.forEach(exclude => {
      const escapedText = $('<div>').text(exclude).html();
      $(`<option>${escapedText}</option>`).appendTo(this.config.articleSelector);
    });

    if (triggerChange) $(this.config.articleSelector).val(this.excludes).trigger('change');
    // $(this.config.articleSelector).select2('close');
  }

  /**
   * Clear the topviews search
   * @return {null} nothing
   */
  clearSearch() {
    if ($('.topviews-search-icon').hasClass('glyphicon-remove')) {
      $('#topviews_search_field').val('');
      $('.topviews-search-icon').removeClass('glyphicon-remove').addClass('glyphicon-search');
      this.drawData();
    }
  }

  /**
   * Exports current chart data to CSV format and loads it in a new tab
   * With the prepended data:text/csv this should cause the browser to download the data
   * @returns {null} nothing
   */
  exportCSV() {
    let csvContent = 'data:text/csv;charset=utf-8,Page,Views\n';

    this.pageData.forEach(entry => {
      if (this.excludes.includes(entry.article)) return;
      // Build an array of site titles for use in the CSV header
      let title = '"' + entry.article.replace(/"/g, '""') + '"';

      csvContent += `${title},${entry.views}\n`;
    });

    this.downloadData(csvContent, 'csv');
  }

  /**
   * Exports current chart data to JSON format and loads it in a new tab
   * @returns {null} nothing
   */
  exportJSON() {
    let data = [];

    this.pageData.forEach((entry, index) => {
      if (this.excludes.includes(entry.article)) return;
      data.push({
        page: entry.article,
        views: entry.views
      });
    });

    const jsonContent = 'data:text/json;charset=utf-8,' + JSON.stringify(data);
    this.downloadData(jsonContent, 'json');
  }

  /**
   * Link to /pageviews for given article and chosen daterange
   * @param {string} article - page name
   * @returns {string} URL
   */
  getPageviewsURL(article) {
    // first get the date range
    const date = moment(app.datepicker.getDate());
    let startDate, endDate;
    if (this.isMonthly()) {
      startDate = date.format('YYYY-MM-01');
      endDate = date.endOf('month').format('YYYY-MM-DD');
    } else {
      // surround single dates with 3 days to make the pageviews chart meaningful
      startDate = date.subtract(3, 'days').format('YYYY-MM-DD');
      endDate = date.add(3, 'days').format('YYYY-MM-DD');
    }

    const platform = $(this.config.platformSelector).val(),
      project = $(this.config.projectInput).val();

    return `/pageviews?start=${startDate}&end=${endDate}&project=${project}&platform=${platform}&pages=${article}`;
  }

  /**
   * Get all user-inputted parameters except the pages
   * @param {boolean} [specialRange] whether or not to include the special range instead of start/end, if applicable
   * @return {Object} project, platform, excludes, etc.
   */
  getParams(specialRange = true) {
    let params = {
      project: $(this.config.projectInput).val(),
      platform: $(this.config.platformSelector).val()
    };

    /**
     * Override start and end with custom range values, if configured (set by URL params or setupDateRangeSelector)
     * Valid values are those defined in config.specialRanges, constructed like `{range: 'last-month'}`,
     *   or a relative range like `{range: 'latest-N'}` where N is the number of days.
     */
    if (this.specialRange && specialRange) {
      params.date = this.specialRange.range;
    } else {
      params.date = moment(this.datepicker.getDate()).format('YYYY-MM-DD');
    }

    return params;
  }

  /**
   * Get params needed to create a permanent link of visible data
   * @return {Object} hash of params
   */
  getPermaLink() {
    let params = this.getParams(false);
    delete params.range;
    return params;
  }

  /**
   * Set datepicker based on provided relative range
   * @param {String} range - e.g. 'last-month', 'yesterday'
   * @returns {Boolean} whether a valid range was provided and was set
   * @override
   */
  setSpecialRange(range) {
    if (range === 'last-month') {
      // '05' is an arbitrary date past the 1st to get around timezone conversion
      const dateStr = moment().subtract(1, 'month').format('YYYY-MM-') + '05';
      this.datepicker.setDate(new Date(dateStr));
      this.specialRange = true;
    } else if (range === 'yesterday') {
      let yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      this.datepicker.setDate(yesterday);
      this.specialRange = true;
    } else {
      return false;
    }

    return true;
  }

  /**
   * Set datepicker based on provided date or range
   * @param {String} dateInput - either a range like 'last-month', 'yesterday' or date with format 'YYYY-MM-DD'
   * @returns {null} nothing
   */
  setDate(dateInput) {
    // attempt to parse date to determine if we were given a range
    const date = Date.parse(dateInput);

    if (isNaN(date)) {
      // invalid date, so attempt to set as special range, or default range if range is invalid
      this.setSpecialRange(dateInput) || this.setSpecialRange(this.config.defaults.dateRange);
    } else {
      this.datepicker.setDate(new Date(dateInput));
    }
  }

  /**
   * Parses the URL query string and sets all the inputs accordingly
   * Should only be called on initial page load, until we decide to support pop states (probably never)
   * @returns {null} nothing
   */
  popParams() {
    this.startSpinny();
    const params = this.parseQueryString('excludes');

    $(this.config.projectInput).val(params.project || this.config.defaults.project);
    if (this.validateProject()) return;

    this.patchUsage();

    this.setDate(params.date);

    $(this.config.platformSelector).val(params.platform || 'all-access');

    if (!params.excludes || (params.excludes.length === 1 && !params.excludes[0])) {
      this.excludes = this.config.defaults.excludes;
    } else {
      this.excludes = params.excludes.map(exclude => exclude.descore());
    }

    this.params = location.search;

    this.initData().then(() => {
      this.setupArticleSelector();
      this.drawData();
      this.setupListeners();
    });
  }

  /**
   * Replaces history state with new URL query string representing current user input
   * Called whenever we go to update the chart
   * @returns {null} nothing
   */
  pushParams() {
    const excludes = this.underscorePageNames(this.excludes).join('|').replace(/[&%]/g, escape);

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, `?${$.param(this.getParams())}&excludes=${excludes}`);
    }

    $('.permalink').prop('href', `?${$.param(this.getPermaLink())}&excludes=${excludes}`);
  }

  /**
   * Removes all article selector related stuff then adds it back
   * @returns {null} nothing
   */
  resetArticleSelector() {
    const articleSelector = $(this.config.articleSelector);
    articleSelector.off('change');
    articleSelector.val(null);
    articleSelector.html('');
    articleSelector.select2('data', null);
    articleSelector.select2('destroy');
    this.setupArticleSelector();
  }

  /**
   * Removes chart, messages, and resets article selections
   * @returns {null} nothing
   */
  resetView(clearSelector = true) {
    this.max = null;
    this.offset = 0;
    this.pageData = [];
    this.pageNames = [];
    this.stopSpinny();
    $('.chart-container').html('');
    $('.expand-chart').hide();
    $('.data-links').addClass('invisible');
    $('.search-topviews').addClass('invisible');
    $('.message-container').html('');
    if (clearSelector) {
      this.resetArticleSelector();
      this.excludes = [];
    }
  }

  /**
   * Search the topviews data for the given page title
   * and restrict the view to the matches
   * @returns {null} nothing
   */
  searchTopviews() {
    const query = $('#topviews_search_field').val();

    if (!query) return this.clearSearch();

    let matchedData = [], count = 0;

    // add ranking to pageData and fetch matches
    this.pageData.forEach((entry, index) => {
      if (!this.excludes.includes(entry.article)) {
        count++;
        if (new RegExp(query, 'i').test(entry.article)) {
          entry.rank = count;
          entry.index = index;
          matchedData.push(entry);
        }
      }
    });

    $('.chart-container').html('');
    $('.expand-chart').hide();
    $('.topviews-search-icon').removeClass('glyphicon-search').addClass('glyphicon-remove');

    matchedData.forEach(item => {
      const width = 100 * (item.views / this.max),
        direction = !!i18nRtl ? 'to left' : 'to right';

      $('.chart-container').append(
        `<div class='topview-entry' style='background:linear-gradient(${direction}, #EEE ${width}%, transparent ${width}%)'>
         <span class='topview-entry--remove glyphicon glyphicon-remove' data-article-id=${item.index} aria-hidden='true'></span>
         <span class='topview-entry--rank'>${item.rank}</span>
         <a class='topview-entry--label' href="${this.getPageURL(item.article)}" target="_blank">${item.article}</a>
         <span class='topview-entry--leader'></span>
         <a class='topview-entry--views' href='${this.getPageviewsURL(item.article)}'>${this.formatNumber(item.views)}</a></div>`
      );
    });

    $('.topview-entry--remove').off('click').on('click', e => {
      const pageName = this.pageNames[$(e.target).data('article-id')];
      this.addExclude(pageName);
      this.searchTopviews(query, false);
    });
  }

  /**
   * Sets up the article selector and adds listener to update chart
   * @param {array} excludes - default page names to exclude
   * @returns {null} - nothing
   */
  setupArticleSelector(excludes = this.excludes) {
    const articleSelector = $(this.config.articleSelector);

    articleSelector.select2({
      data: [],
      maximumSelectionLength: 50,
      minimumInputLength: 0,
      placeholder: $.i18n('hover-to-exclude')
    });

    if (excludes.length) this.setArticleSelectorDefaults(excludes);

    articleSelector.on('change', e => {
      this.excludes = $(e.target).val() || [];
      this.max = null;
      this.drawData();
      // $(this).select2().trigger('close');
    });

    /**
     * for topviews we don't want the user input functionality of Select2
     * setTimeout of 0 to let rendering threads catch up and actually disable the field
     */
    setTimeout(() => {
      $('.select2-search__field').prop('disabled', true);
    });
  }

  /**
   * Directly set articles in article selector
   * Currently is not able to remove underscore from page names
   *
   * @param {array} pages - page titles
   * @returns {array} - untouched array of pages
   */
  setArticleSelectorDefaults(pages) {
    pages = pages.map(page => {
      // page = page.replace(/ /g, '_');
      const escapedText = $('<div>').text(page).html();
      $('<option>' + escapedText + '</option>').appendTo(this.config.articleSelector);
      return page;
    });
    $(this.config.articleSelector).select2('val', pages);
    $(this.config.articleSelector).select2('close');

    return pages;
  }

  /**
   * sets up the daterange selector and adds listeners
   * @param {String} [type] - either 'monthly' or 'daily'
   * @returns {null} - nothing
   */
  setupDateRangeSelector(type = 'monthly') {
    let yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const datepickerParams = type === 'monthly' ? {
      format: 'MM yyyy',
      viewMode: 'months',
      minViewMode: 'months',
      endDate: '-1m'
    } : {
      format: 'yyyy-mm-dd',
      viewMode: 'days',
      endDate: yesterday
    };

    $(this.config.dateRangeSelector).datepicker('destroy');
    $(this.config.dateRangeSelector).datepicker(
      Object.assign({
        autoclose: true,
        startDate: new Date('2015-07-01')
      }, datepickerParams)
    );
  }

  /**
   * General place to add page-wide listeners
   * @returns {null} - nothing
   */
  setupListeners() {
    super.setupListeners();

    $(this.config.platformSelector).on('change', this.processInput.bind(this));
    $('#date-type-select').on('change', e => {
      this.setupDateRangeSelector(e.target.value);
    });
    $('.expand-chart').on('click', () => {
      this.offset += this.config.pageSize;
      this.drawData();
    });
    $(this.config.dateRangeSelector).on('change', e => {
      /** clear out specialRange if it doesn't match our input */
      if (this.specialRange && this.specialRange.value !== e.target.value) {
        this.specialRange = null;
      }
      this.processInput();
    });
    $('#topviews_search_field').on('keyup', this.searchTopviews.bind(this));
    $('.topviews-search-icon').on('click', this.clearSearch.bind(this));
  }

  /**
   * Setup listeners for project input
   * @returns {null} - nothing
   */
  setupProjectInput() {
    $(this.config.projectInput).on('change', e => {
      if (!e.target.value) {
        e.target.value = this.config.defaults.project;
        return;
      }
      if (this.validateProject()) return;
      this.resetView(false);
      this.processInput(true).then(resetArticleSelector);
    });
  }

  /**
   * Get instance of datepicker
   * @return {Object} the datepicker instance
   */
  get datepicker() {
    return $(this.config.dateRangeSelector).data('datepicker');
  }

  /**
   * Are we in 'monthly' mode? (If we aren't then we're in daily)
   * @return {Boolean} yes or no
   */
  isMonthly() {
    return $('#date-type-select').val() === 'monthly';
  }

  /**
   * Get the currently selected date for the purposes of pageviews API call
   * @return {String} formatted date
   */
  getAPIDate() {
    const datepickerValue = this.datepicker.getDate();

    if (this.isMonthly()) {
      return moment(datepickerValue).format('YYYY/MM') + '/all-days';
    } else {
      return moment(datepickerValue).format('YYYY/MM/DD');
    }
  }

  /**
   * Fetch data from API
   * @returns {Deferred} promise with data
   */
  initData() {
    let dfd = $.Deferred();

    this.startSpinny();
    $('.expand-chart').hide();

    const access = $(this.config.platformSelector).val();

    $.ajax({
      url: `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${this.project}/${access}/${this.getAPIDate()}`,
      dataType: 'json'
    }).done(data => {
      // store pageData from API, removing underscores from the page name
      this.pageData = data.items[0].articles.map(page => {
        page.article = page.article.descore();
        return page;
      });

      /** build the pageNames array for Select2 */
      this.pageNames = this.pageData.map(page => page.article);

      if (this.excludes.length) {
        return dfd.resolve(this.pageData);
      } else {
        /** find first 30 non-mainspace pages and exclude them */
        this.filterByNamespace(this.pageNames.slice(0, 30)).done(() => {
          return dfd.resolve(this.pageData);
        });
      }
    });

    return dfd;
  }

  /**
   * Get the pages that are not in the given namespace
   * @param {array} pages - pages to filter
   * @param  {Number} [ns] - namespace to restrict to, defaults to main
   * @return {Deferred} promise resolving with page titles that are not in the given namespace
   */
  filterByNamespace(pages, ns = 0) {
    let dfd = $.Deferred();

    return $.ajax({
      url: `https://${this.project}.org/w/api.php`,
      data: {
        action: 'query',
        titles: pages.join('|'),
        meta: 'siteinfo',
        siprop: 'general',
        format: 'json'
      },
      prop: 'info',
      dataType: 'jsonp'
    }).always(data => {
      if (data && data.query && data.query.pages) {
        let normalizeMap = {};
        (data.query.normalized || []).map(entry => {
          normalizeMap[entry.to] = entry.from;
        });

        let excludes = [data.query.general.mainpage];
        Object.keys(data.query.pages).forEach(key => {
          const page = data.query.pages[key];
          if (page.ns !== ns || page.missing === '') {
            const title = data.query.pages[key].title,
              normalizedTitle = normalizeMap[title];
            delete normalizeMap[title];
            excludes.push(normalizedTitle || title);
          }
        });
        this.addExclude(excludes);
      }

      dfd.resolve();
    });
  }

  /**
   * Checks value of project input and validates it against site map
   * @returns {boolean} whether the currently input project is valid
   */
  validateProject() {
    const project = $(this.config.projectInput).val();
    if (siteDomains.includes(project)) {
      $('body').removeClass('invalid-project');
    } else {
      this.resetView();
      this.writeMessage(
        $.i18n('invalid-project', `<a href='//${project}'>${project}</a>`),
        true
      );
      $('body').addClass('invalid-project');
      return true;
    }
  }
}

$(document).ready(() => {
  /** assume hash params are supposed to be query params */
  if (document.location.hash && !document.location.search) {
    return document.location.href = document.location.href.replace('#', '?');
  } else if (document.location.hash) {
    return document.location.href = document.location.href.replace(/\#.*/, '');
  }

  new TopViews();
});
