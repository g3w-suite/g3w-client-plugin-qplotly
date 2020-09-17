const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const service = require('../../service');
const tPlugin = g3wsdk.core.i18n.tPlugin;
const GUI = g3wsdk.gui.GUI;

const Component = ComponentsFactory.build(
  {
    service
  },
  {
    id: 'qplotly',
    title: 'Chart',
    open: false,
    collapsible: false,
    iconColor: 'red',
    icon: GUI.getFontClass('chart'),
    mobile: true,
    events: {
      open: (bool) =>{
        service.showChart(bool);
      }
    }
  }
);


module.exports = Component;
