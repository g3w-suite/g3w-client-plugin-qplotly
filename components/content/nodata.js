module.exports = {
  props:{
    id: {
      type: Number
    }
  },
  render(h){
    return h('div', [
      h('h4', {
        style: {
          fontWeight: 'bold'
        },
        class:{
          'skin-color':true
        }
      },`Plot [${this.$props.id}]`),
      h('div', {
        directives: [{
          name:'t-plugin',
          value: 'qplotly.no_data'
        }],
        style: {
          fontWeight: 'bold'
        },
        class: {
          'skin-color': true
        }
      })
    ])
  }
};