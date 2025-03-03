import { AppRouter } from 'autorouter'
import { RouterConstant } from '@kk/common';

@AppRouter({ name: RouterConstant.HOME_NAME, login: true, hasParam: true })
@Component
export struct HomePage {
  routerParam: ESObject;
  @State message: string = 'Hello World';

  build() {
    Row() {
      Column() {
        Text(this.message)
          .fontSize($r('app.float.page_text_font_size'))
          .fontWeight(FontWeight.Bold)
          .onClick(() => {
            this.message = 'Welcome';
          })
      }
      .width('100%')
    }
    .height('100%')
  }
}
