/**
 * Analytics — merges District Analytics (live comparison) and Historical
 * Analytics (multi-year trends & seasonality) into one tabbed module.
 * The global search still lands here as '#/analytics?q=<term>' and pre-filters
 * the District Comparison tab.
 */
import { makeTabbedView } from '../components.js';
import districtAnalytics from './district-analytics.js';
import historical from './historical.js';

export default makeTabbedView({
    title: 'Analytics',
    subtitle: 'District comparison & historical trends',
    tabsId: 'analytics-tabs',
    items: [
        { value: 'district', label: 'District Comparison', icon: 'bar-chart-2', view: districtAnalytics },
        { value: 'historical', label: 'Historical Trends', icon: 'history', view: historical }
    ]
});
