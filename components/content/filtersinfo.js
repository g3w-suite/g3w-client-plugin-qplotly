module.exports = {
  name: 'filtersinfo',
  props:{
    filters: {
      type: Array,
      default: []
    }
  },
  render(h){
    return h('ul', {
      style: {
        padding: '8px 0 0 20px',
      }
    }, this.filters.map(filter => h('li', {
       directives: [{
         name: 't-plugin',
         value: `qplotly.filters.${filter}`
       }]
      }))
    )
  }
};