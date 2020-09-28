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
