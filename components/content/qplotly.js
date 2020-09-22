import QPlotly from './qplotly.vue';
const {base, inherit} = g3wsdk.core.utils;
const Component = g3wsdk.gui.vue.Component;

function QPlotlyComponent(options={}){
  base(this, options);
  const {service} = options;
  this.title = "qplotly";
  this.state.visible = true;
  const InternalComponent = Vue.extend(QPlotly);
  this.internalComponent = new InternalComponent({
    service
  });
}

inherit(QPlotlyComponent, Component);

module.exports = QPlotlyComponent;