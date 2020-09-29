const template = require('./multiplot.html');

export default function MultiPlot({service}={}){
  return  {
    name: "qplotly",
    data(){
      return {
        plots: []
      };
    },
    template,
    computed: {
      disabled(){
        return service.state.loading;
      },
      pieplots(){
        return this.plots.filter(plot => plot.plot.type === 'pie');
      },
      subplots(){
        return this.plots.filter(plot => plot.plot.type !== 'pie');
      }
    },
    methods:{
      addRemovePlot(evt, plot){
        evt.target.checked ? service.showPlot(plot) : service.hidePlot(plot);
        this.disabled = true;
      }
    },
    created() {
      this.plots = service.getPlots();
    }
  }
};
