/**
 * Sensor Network — merges the former Sensors (inventory) and Sensor Health
 * (diagnostics) views into one tabbed module. They share the SENSORS dataset,
 * so one mental model with two tabs beats two separate nav entries.
 */
import { makeTabbedView } from '../components.js';
import sensors from './sensors.js';
import sensorHealth from './sensor-health.js';

export default makeTabbedView({
    title: 'Sensor Network',
    subtitle: 'Fleet inventory, placement & health diagnostics',
    tabsId: 'sensor-network-tabs',
    items: [
        { value: 'inventory', label: 'Inventory', icon: 'radio-receiver', view: sensors },
        { value: 'health', label: 'Health & Diagnostics', icon: 'activity', view: sensorHealth }
    ]
});
