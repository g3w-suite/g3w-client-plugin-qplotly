import pluginConfig from './config';
import MultiPlotComponent from './components/sidebar/Multiplot.vue';
import Service from './service';
const {base, inherit} = g3wsdk.core.utils;
const {GUI} = g3wsdk.gui;
const {Plugin:BasePlugin} = g3wsdk.core.plugin;

const Plugin = function() {
  const {name, i18n} = pluginConfig;
  base(this, {
    name,
    service: Service,
    i18n
  });
  this.service.once('ready', () => {
    if (this.registerPlugin(this.config.gid)) {
      this.setupGUI();
      this.setReady(true);
    }
  });
  this.service.init(this.config);
};

inherit(Plugin, BasePlugin);

Plugin.prototype.setupGUI = function(){

  const sidebarItemComponent = this.createSideBarComponent(MultiPlotComponent,
    {
      id: 'qplotly',
      title: 'plugins.qplotly.title',
      open: false,
      collapsible: true,
      iconConfig: {
        color: 'red',
        icon:'chart-area',
      },
      mobile: true,
      events: {
        open: {
          when: 'before',
          cb: async bool => {
            await this.service.showChart(bool);
          }
        }
      },
      sidebarOptions: {
        position: 1
      }
    });

  GUI.on('closecontent', () => {
    setTimeout(() => {
      if (sidebarItemComponent.getOpen()) {
        sidebarItemComponent.click();
      }
    })
  })
};

Plugin.prototype.unload = function() {
  this.service.clear();
}

new Plugin();

