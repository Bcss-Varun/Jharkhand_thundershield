/**
 * Alerts & Automation — merges multi-channel Alerts and SOP Automation into
 * one tabbed module. They are two halves of the same response pipeline (SOP
 * rules fire alerts), so they belong together. Kept on the '#/alerts' route so
 * the sidebar badge, notifications, and existing deep links stay valid.
 */
import { makeTabbedView } from '../components.js';
import alerts from './alerts.js';
import sop from './sop.js';

export default makeTabbedView({
    title: 'Alerts & Automation',
    subtitle: 'Multi-channel dispatch & automated SOP rules',
    tabsId: 'alerts-automation-tabs',
    items: [
        { value: 'delivery', label: 'Alert Delivery', icon: 'bell', view: alerts },
        { value: 'automation', label: 'Automation Rules', icon: 'git-merge', view: sop }
    ]
});
